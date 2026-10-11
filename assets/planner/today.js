// /to-do: the combined view. Board on the left, the selected day's timeline on the right.
import { requireMember, signOut } from "./auth.js";
import * as db from "./data.js";
import { prepareImage } from "./proof-upload.js";
import { approvalsHTML, handleApprovalClick } from "./approvals.js";
import {
  esc, todayStr, addDays, dayOf, minOf, fmtTime, fmtDay, zonedToIso, isoToLocalInputs,
  Model, COLUMNS, KIND_LABEL,
} from "./model.js";

const app = document.getElementById("app");
const session = await requireMember(app);

const m = new Model();
// Deep links from /schedule: /to-do/?date=YYYY-MM-DD&task=<id>
const params = new URLSearchParams(location.search);
const view = {
  date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") || "") ? params.get("date") : todayStr(),
  openTask: null, log: [], urls: {}, pending: null, spread: null,
};

app.innerHTML = `
  <div class="topbar">
    <span class="brand">jordanleis.com/to-do</span>
    <nav class="tabs"><a class="tab active" href="/to-do/">Today</a><a class="tab" href="/schedule/">Week</a></nav>
    <div class="stepper">
      <button class="btn" data-action="prev" aria-label="Previous day">‹</button>
      <button class="btn" data-action="today">Today</button>
      <button class="btn" data-action="next" aria-label="Next day">›</button>
    </div>
    <div class="spacer"></div>
    <span class="counter" id="counter"></span>
    <span class="who">● ${esc(session.user.email)}</span>
    <button class="btn" data-action="signout">Sign out</button>
  </div>
  <main class="combo">
    <section>
      <div class="panel approvals" id="approvals" hidden></div>
      <div class="projects" id="projects" hidden></div>
      <div class="board" id="board"></div>
    </section>
    <section class="panel tl-panel"><h2 id="tl-title"></h2><div class="timeline" id="timeline"></div></section>
  </main>
  <aside class="drawer" id="drawer" aria-label="Task details"></aside>
  <div class="modal-bg" id="modal-bg"><div class="modal" id="modal" role="dialog" aria-modal="true"></div></div>
  <div class="toast" id="toast" role="status"></div>`;

const $ = (id) => document.getElementById(id);

function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), isError ? 6000 : 2500);
}

async function act(fn) {
  try {
    await fn();
  } catch (e) {
    console.error(e);
    toast(e.message || "Something went wrong", true);
    await reload();
  }
}

async function reload() {
  m.set(await db.loadAll());
  render();
}

// ---------- board ----------
function deadlineBadge(t) {
  const src = t.due_at ? t : m.projectOf(t)?.due_at ? m.projectOf(t) : null;
  if (!src) return "";
  const u = m.urgency({ ...src, status: t.status });
  const when = src.due_has_time ? `${fmtDay(dayOf(src.due_at))} ${fmtTime(src.due_at)}` : fmtDay(dayOf(src.due_at));
  return `<span class="badge due ${u}">${u === "overdue" ? "overdue · " : "due "}${when}</span>`;
}

function cardHTML(t) {
  const subs = m.subtasksOf(t.id);
  const by = t.status !== "done" ? m.doneBy(t.id) : null;
  const slipped = m.slipped(t.id);
  const orphan = m.orphans(t.id);
  const proof = t.status === "done"
    ? `<span class="badge ok">✓ proof</span>`
    : t.status === "in_progress" && !m.hasProof(t) ? `<span class="badge need">needs proof</span>` : "";
  const project = m.projectOf(t);
  return `<div class="card" draggable="true" data-task="${t.id}" tabindex="0">
    <div class="t">${esc(t.title)}</div>
    <div class="meta">${project ? `<span class="badge ofproj">↳ ${esc(project.title)}</span>` : ""}${deadlineBadge(t)}${by ? `<span class="badge by">⏱ by ${by}</span>` : ""}${slipped ? `<span class="badge slip">slipped ×${slipped}</span>` : ""}${orphan ? `<span class="badge slip">block moved: re-place</span>` : ""}${subs.length ? `<span class="badge">☑ ${subs.filter((s) => s.done).length}/${subs.length}</span>` : ""}${proof}${t.tags.map((g) => `<span class="badge">#${esc(g)}</span>`).join("")}</div>
  </div>`;
}

function renderBoard() {
  $("board").innerHTML = COLUMNS.map(([status, label]) => {
    const list = m.tasksIn(status);
    return `<div class="col" data-drop-status="${status}">
      <div class="col-h"><span>${label}</span><small>${list.length}</small></div>
      ${status === "backlog" || status === "todo" ? `<input type="text" class="add" placeholder="+ add task, press Enter" data-add="${status}" aria-label="Add task to ${label}">` : ""}
      ${list.map(cardHTML).join("") || `<div class="empty">nothing here</div>`}
    </div>`;
  }).join("");
}

function renderProjects() {
  const list = m.projects().filter((p) => p.status !== "done" || (p.completed_at && Date.now() - new Date(p.completed_at) < 7 * 864e5));
  const el = $("projects");
  el.hidden = !list.length;
  el.innerHTML = list.length ? `<h2>Projects</h2><div class="proj-row">${list.map((p) => {
    const { done, total } = m.progress(p.id), next = m.nextPart(p.id);
    return `<div class="proj ${p.status === "done" ? "done" : ""}" data-task="${p.id}" tabindex="0">
      <div class="t">${esc(p.title)}</div>
      <div class="bar" role="progressbar" aria-valuenow="${done}" aria-valuemax="${total}"><i style="width:${total ? (100 * done) / total : 0}%"></i></div>
      <div class="meta"><span class="badge">${done}/${total} parts</span>${deadlineBadge(p)}</div>
      <div class="hint">${p.status === "done" ? "All parts done ✓" : next ? `Next: ${esc(next.task.title)} · ${fmtDay(next.block.date)} ${fmtTime(next.block.start_at)}` : "No parts committed yet"}</div>
    </div>`;
  }).join("")}</div>` : "";
}

function renderApprovals() {
  const html = approvalsHTML(m, (task, p) =>
    `<button class="btn small primary" data-action="replace" data-task-id="${task.id}" data-date="${esc(p.block_key.split(":")[0])}">Re-place</button>`);
  $("approvals").hidden = !html;
  $("approvals").innerHTML = html;
}

// ---------- timeline ----------
const TL_START = 8 * 60, TL_END = 23 * 60;
const pos = (startMin, endMin) => `top:calc(var(--ppm)*${Math.max(startMin, TL_START) - TL_START}px);height:calc(var(--ppm)*${Math.max(15, Math.min(endMin, TL_END) - Math.max(startMin, TL_START))}px)`;
const OUTCOME_ICON = { planned: "☐", done: "✓", missed: "✗", orphan: "?" };

function renderTimeline() {
  const d = view.date;
  $("tl-title").textContent = d === todayStr() ? `Today: ${fmtDay(d)}` : fmtDay(d);
  let h = "";
  for (let hr = 8; hr <= 23; hr++) h += `<div class="hr" style="top:calc(var(--ppm)*${(hr * 60 - TL_START)}px)">${hr % 12 || 12}${hr < 12 ? "a" : "p"}</div>`;
  for (const e of m.eventsOn(d)) {
    const cls = e.auto_added ? "ai" : e.source === "portal" ? "class" : "personal";
    h += `<div class="tl-ev ev ${cls}" style="${pos(minOf(e.start_at), minOf(e.end_at))}" title="${esc(e.title)}">${e.auto_added ? '<span class="badge ai">AUTO</span> ' : ""}${esc(e.title.replace(/^\[Auto\]\s*/, ""))}</div>`;
  }
  for (const b of m.blocksOn(d)) {
    const st = pos(minOf(b.start_at), minOf(b.end_at));
    if (b.kind === "work" || b.kind === "self") {
      const items = m.tasksInBlock(b.key);
      h += `<div class="tl-ev tl-block ${b.kind} ${m.blockPast(b) ? "past" : ""} ${m.blockNow(b) ? "now" : ""}" data-drop-block="${b.key}" style="${st}">
        <div class="bh">${m.blockLabel(b)} · ${fmtTime(b.start_at)}–${fmtTime(b.end_at)}</div>
        ${items.map(({ task, outcome }) => `<div class="bt" data-task="${task.id}">${OUTCOME_ICON[outcome]} ${esc(task.title)}</div>`).join("")}
      </div>`;
    } else {
      h += `<div class="tl-ev ev meal" style="${st}">${KIND_LABEL[b.kind]}</div>`;
    }
  }
  for (const t of m.dueOn(d)) {
    const at = t.due_has_time ? minOf(t.due_at) : TL_END - 5;
    h += `<div class="due-line" style="top:calc(var(--ppm)*${Math.min(at, TL_END) - TL_START}px)" data-task="${t.id}"><span>⚑ ${esc(t.title)} due${t.due_has_time ? " " + fmtTime(t.due_at) : ""}</span></div>`;
  }
  if (d === todayStr()) {
    const now = minOf(new Date().toISOString());
    if (now >= TL_START && now <= TL_END) h += `<div class="nowline" style="top:calc(var(--ppm)*${now - TL_START}px)"></div>`;
  }
  $("timeline").innerHTML = h;
}

function renderCounter() {
  const c = m.saidVsDid(todayStr());
  $("counter").textContent = `said→did · today ${c.today.done}/${c.today.total} · week ${c.week.done}/${c.week.total}`;
}

function render({ drawer = true } = {}) {
  renderApprovals();
  renderProjects();
  renderBoard();
  renderTimeline();
  renderCounter();
  // Don't redraw the drawer under someone's cursor mid-typing.
  const typing = $("drawer").contains(document.activeElement) && document.activeElement.matches("input[type=text], textarea");
  if (drawer && view.openTask && !typing) renderDrawer();
}

// ---------- drawer ----------
async function openDrawer(id) {
  view.openTask = id;
  view.log = [];
  renderDrawer();
  const t = m.task(id);
  const [log, urls] = await Promise.all([
    db.loadLog(id),
    db.signedUrls(m.proofsOf(id).filter((p) => p.storage_path).map((p) => p.storage_path)),
  ]);
  if (view.openTask !== id || !t) return;
  view.log = log;
  view.urls = { ...view.urls, ...urls };
  renderDrawer();
}

function closeDrawer() {
  view.openTask = null;
  $("drawer").classList.remove("open");
}

function renderDrawer(gateMessage = "") {
  const el = $("drawer");
  const t = view.openTask && m.task(view.openTask);
  if (!t) return closeDrawer();
  const due = isoToLocalInputs(t.due_at, t.due_has_time);
  const placements = m.placementsOf(t.id);
  const isProject = m.isProject(t), project = m.projectOf(t);
  el.innerHTML = `
    <div class="row between"><h2>${isProject ? "Project" : project ? "Part" : "Task"}</h2><button class="btn" data-action="close" aria-label="Close">✕</button></div>
    ${project ? `<div class="hint">Part of <button class="linkbtn" data-action="open" data-id="${project.id}">${esc(project.title)}</button></div>` : ""}
    <input type="text" class="title-input" value="${esc(t.title)}" data-field="title" aria-label="Title">
    <div class="row">
      <select data-field="status" aria-label="Status" ${isProject ? "disabled title=\"Set by its parts\"" : ""}>${COLUMNS.map(([k, l]) => `<option value="${k}" ${k === t.status ? "selected" : ""}>${l}</option>`).join("")}</select>
      <input type="text" value="${esc(t.tags.join(", "))}" data-field="tags" placeholder="tags, comma separated" aria-label="Tags">
    </div>
    <div class="sec"><h2>Deadline</h2>
      <div class="row"><input type="date" value="${due.date}" data-field="due-date" aria-label="Due date">
        <input type="time" value="${due.time}" data-field="due-time" aria-label="Due time (optional)">
        ${t.due_at ? `<button class="btn" data-action="clear-due">Clear</button>` : ""}</div>
      <div class="hint">Time is optional. Without one, it's due by end of day.</div></div>
    ${isProject ? partsHTML(t) : ""}
    <div class="sec" ${isProject && !placements.length ? "hidden" : ""}><h2>Commitments</h2>
      ${placements.map((p) => {
        const b = m.block(p.block_key), o = m.outcome(p);
        return `<div class="row"><span class="badge ${o === "missed" || o === "orphan" ? "slip" : o === "done" ? "ok" : "by"}">${o === "orphan" ? "block moved" : o}</span>
          <span>${b ? `${fmtDay(b.date)} ${m.blockLabel(b)} · ${fmtTime(b.start_at)}–${fmtTime(b.end_at)}` : esc(p.block_key)}</span>
          ${o === "planned" || o === "orphan" ? `<button class="btn small" data-action="unplace" data-id="${p.id}" aria-label="Remove commitment">✕</button>` : ""}</div>`;
      }).join("") || `<div class="hint">Not committed to a block yet.</div>`}
      ${t.status !== "done" && !isProject ? `<button class="btn" data-action="commit">+ Commit to a block</button>` : ""}</div>
    <div class="sec"><h2>Subtasks</h2>
      ${m.subtasksOf(t.id).map((s) => `<div class="row"><label class="check"><input type="checkbox" data-sub="${s.id}" ${s.done ? "checked" : ""}> ${esc(s.title)}</label>
        <button class="btn small ghost" data-action="del-sub" data-id="${s.id}" aria-label="Delete subtask">✕</button></div>`).join("")}
      <input type="text" placeholder="+ subtask, press Enter" data-addsub aria-label="Add subtask"></div>
    ${!isProject && !project && t.status !== "done" ? `<div class="sec"><h2>Spread over several days?</h2>
      <div class="hint">Turn this into a project: each part gets its own day, block, proof and deadline.</div>
      ${splitHTML(t)}
      ${m.subtasksOf(t.id).some((x) => !x.done) ? `<button class="btn mt" data-action="to-parts">Turn unchecked subtasks into parts</button>` : ""}</div>` : ""}
    <div class="sec"><h2>Work log</h2>
      ${view.log.map((l) => `<div class="log"><span class="mono">${fmtDay(dayOf(l.created_at))} ${fmtTime(l.created_at)}</span> · ${esc(l.body)}</div>`).join("")}
      <input type="text" placeholder="What did you just do? Enter to log" data-addlog aria-label="Add log entry"></div>
    <div class="sec"><h2>Proof</h2>
      <div class="proofs">${m.proofsOf(t.id).map((p) => p.kind === "photo"
        ? `<div class="proof"><a href="${esc(view.urls[p.storage_path] || "#")}" target="_blank" rel="noopener">${view.urls[p.storage_path] && !p.storage_path.endsWith(".pdf") ? `<img src="${esc(view.urls[p.storage_path])}" alt="${esc(p.label || "proof photo")}">` : "📄 " + esc(p.label || "file")}</a><button class="btn small ghost" data-action="del-proof" data-id="${p.id}" aria-label="Delete proof">✕</button></div>`
        : `<div class="proof link">🔗 <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.label || p.url)}</a><button class="btn small ghost" data-action="del-proof" data-id="${p.id}" aria-label="Delete proof">✕</button></div>`).join("")}</div>
      <div class="row"><label class="btn">📷 Add photo<input type="file" accept="image/*,application/pdf" multiple data-photo hidden></label>
        <input type="text" placeholder="https://… link" data-proofurl aria-label="Proof link"><button class="btn" data-action="add-link">Add</button></div>
      <h2 class="mt">Recap</h2>
      <textarea placeholder="What got done? What did you learn?" data-field="recap" aria-label="Recap">${esc(t.recap)}</textarea>
      ${isProject ? "" : `<label class="check"><input type="checkbox" data-field="proof_required" ${t.proof_required ? "checked" : ""}> Require proof or recap before Done</label>`}</div>
    <div class="sec row between">
      ${isProject ? `<span class="hint">${t.status === "done" ? "Done: every part is finished ✓" : "Completes when all its parts are done."}</span>`
        : t.status !== "done" ? `<button class="btn primary" data-action="done">Mark Done</button>` : `<span class="badge ok">Done ${t.completed_at ? fmtDay(dayOf(t.completed_at)) + " " + fmtTime(t.completed_at) : ""}</span>`}
      <button class="btn danger" data-action="delete">Delete task</button></div>
    <div class="gate ${gateMessage ? "show" : ""}" role="alert">${esc(gateMessage)}</div>`;
  el.classList.add("open");
}

function splitHTML(t) {
  return `<div class="row"><input type="text" placeholder="+ add part, press Enter" data-addpart aria-label="Add part"></div>
    <div class="row split"><span class="hint">or split into</span>
      <input type="number" min="2" max="50" value="10" data-split-n aria-label="Number of parts">
      <span class="hint">parts named</span>
      <input type="text" value="${esc(t.title)}" data-split-name aria-label="Part name">
      <button class="btn" data-action="split">Split</button></div>`;
}

function partsHTML(t) {
  const parts = m.partsOf(t.id), { done, total } = m.progress(t.id);
  return `<div class="sec"><h2>Parts · ${done}/${total} done</h2>
    <div class="bar"><i style="width:${total ? (100 * done) / total : 0}%"></i></div>
    ${parts.map((p) => {
      const by = p.status !== "done" ? m.doneBy(p.id) : null, slipped = m.slipped(p.id);
      return `<div class="row part"><span class="badge ${p.status === "done" ? "ok" : p.status === "in_progress" ? "by" : ""}">${COLUMNS.find(([k]) => k === p.status)[1]}</span>
        <button class="linkbtn grow" data-action="open" data-id="${p.id}">${esc(p.title)}</button>
        ${by ? `<span class="badge by">⏱ ${by}</span>` : ""}${slipped ? `<span class="badge slip">×${slipped}</span>` : ""}
        ${p.status !== "done" && !by ? `<button class="btn small" data-action="commit-part" data-id="${p.id}">Commit</button>` : ""}</div>`;
    }).join("")}
    ${t.status !== "done" ? `${splitHTML(t)}
      ${parts.some((p) => p.status !== "done" && !m.plannedFor(p.id).length) ? `<button class="btn primary mt" data-action="spread">Spread across days…</button>` : ""}` : ""}</div>`;
}

// ---------- projects ----------
// A project's status follows its parts; keep the stored value in step so the sync job agrees.
async function syncProject(parentId) {
  const parent = parentId && m.task(parentId);
  if (!parent || !m.isProject(parent)) return;
  const status = m.derivedStatus(parentId);
  if (status === parent.status) return;
  m.replaceTask(await db.updateTask(parentId, { status, completed_at: status === "done" ? new Date().toISOString() : null }));
  if (status === "done") toast(`Project done: ${parent.title} ✓`);
}

async function addParts(parent, titles) {
  const base = Date.now();
  for (const [i, title] of titles.entries()) {
    m.addTask(await db.createTask({ title, status: "todo", parent_id: parent.id, tags: parent.tags, sort_order: base + i }));
  }
  await syncProject(parent.id);
}

function openSpread(projectId) {
  const parts = m.partsOf(projectId).filter((p) => p.status !== "done" && !m.plannedFor(p.id).length);
  const days = m.placeableDays().filter((d) => m.placeableBlocks(d).some((b) => !m.tasksInBlock(b.key).length));
  if (!days.length) return toast("No free blocks coming up", true);
  view.spread = {
    projectId,
    rows: parts.map((p, i) => {
      const date = days[Math.min(i, days.length - 1)];
      const free = m.placeableBlocks(date).find((b) => !m.tasksInBlock(b.key).length);
      return { taskId: p.id, date, blockKey: free?.key || m.placeableBlocks(date)[0]?.key };
    }),
  };
  renderSpread();
  $("modal-bg").classList.add("show");
}

function renderSpread() {
  const sp = view.spread, project = m.task(sp.projectId), days = m.placeableDays();
  const late = (key) => { const b = m.block(key); return b && project.due_at && b.end_at > project.due_at; };
  $("modal").innerHTML = `
    <h3>Spread: ${esc(project.title)}</h3>
    <p class="hint">One part per day in the first free block. Change any row, then approve. Nothing is committed until you do.</p>
    <div class="spread">${sp.rows.map((r, i) => `
      <div class="spread-row ${late(r.blockKey) ? "late" : ""}">
        <span class="grow">${esc(m.task(r.taskId).title)}</span>
        <select data-spread-day="${i}" aria-label="Day">${days.map((d) => `<option value="${d}" ${d === r.date ? "selected" : ""}>${fmtDay(d)}</option>`).join("")}</select>
        <select data-spread-block="${i}" aria-label="Block">${m.placeableBlocks(r.date).map((b) => {
          const n = m.tasksInBlock(b.key).length + sp.rows.filter((x, j) => j !== i && x.blockKey === b.key).length;
          return `<option value="${b.key}" ${b.key === r.blockKey ? "selected" : ""}>${m.blockLabel(b)} ${fmtTime(b.start_at)}${n ? ` (${n})` : ""}</option>`;
        }).join("")}</select>
      </div>`).join("")}</div>
    ${sp.rows.some((r) => late(r.blockKey)) ? `<div class="warn" role="alert">⚠ Highlighted rows end after the project deadline.</div>` : ""}
    <div class="actions"><button class="btn" data-action="spread-cancel">Cancel</button>
      <button class="btn primary" data-action="spread-approve">Approve ${sp.rows.length} commitment${sp.rows.length > 1 ? "s" : ""}</button></div>`;
}

function closeSpread() {
  view.spread = null;
  $("modal-bg").classList.remove("show");
}

async function approveSpread() {
  const { projectId, rows } = view.spread;
  closeSpread();
  await act(async () => {
    for (const r of rows.filter((r) => r.blockKey)) {
      m.addPlacement(await db.place(r.taskId, r.blockKey));
      const t = m.task(r.taskId);
      if (t.status === "backlog" || t.status === "todo") m.replaceTask(await db.updateTask(r.taskId, { status: "in_progress" }));
    }
    await syncProject(projectId);
    toast(`Committed ${rows.length} parts`);
    render();
  });
}

// ---------- status changes ----------
async function setStatus(id, status, { fromDrop = false } = {}) {
  const t = m.task(id);
  if (!t || t.status === status) return;
  if (status === "done") return markDone(id);
  const prev = t.status;
  const patch = { status, completed_at: null };
  m.patchTask(id, patch);
  render();
  await act(async () => {
    m.replaceTask(await db.updateTask(id, patch));
    await syncProject(t.parent_id);
    if (status === "in_progress" && !m.plannedFor(id).length) {
      openPlacePopup(id, { revertTo: fromDrop ? prev : null });
    }
    render();
  });
}

async function markDone(id) {
  const t = m.task(id);
  if (!m.hasProof(t)) {
    view.openTask = id;
    renderDrawer("Add a photo, a link or a recap first (or untick “Require proof”).");
    $("drawer").classList.remove("shake");
    void $("drawer").offsetWidth;
    $("drawer").classList.add("shake");
    return;
  }
  await act(async () => {
    const now = new Date();
    const planned = m.placementsOf(id).filter((p) => p.outcome === "planned");
    for (const [i, p] of planned.entries()) {
      const b = m.block(p.block_key);
      if (i > 0 && b && new Date(b.start_at) > now) {
        await db.deletePlacement(p.id); // finished early: free the extra future blocks
        m.removePlacement(p.id);
      } else {
        m.replacePlacement(await db.updatePlacement(p.id, { outcome: "done", resolved_at: now.toISOString() }));
      }
    }
    m.replaceTask(await db.updateTask(id, { status: "done", completed_at: now.toISOString() }));
    toast("Done ✓");
    await syncProject(t.parent_id);
    render();
  });
}

// ---------- placement popup: pick a day, then a block ----------
function openPlacePopup(taskId, { date = null, blockKey = null, revertTo = null } = {}) {
  if (m.isProject(m.task(taskId))) return toast("Commit the project's parts instead", true);
  const days = m.placeableDays();
  if (!days.length) return toast("No upcoming blocks to commit to", true);
  const start = blockKey ? m.block(blockKey).date : date && days.includes(date) ? date : days[0];
  view.pending = { taskId, date: start, blockKey, revertTo };
  renderPopup();
  $("modal-bg").classList.add("show");
}

function renderPopup() {
  const p = view.pending, t = m.task(p.taskId);
  const days = m.placeableDays();
  const chips = days.slice(0, 7);
  const blocks = m.placeableBlocks(p.date);
  if (!blocks.some((b) => b.key === p.blockKey)) {
    p.blockKey = (blocks.find((b) => !m.tasksInBlock(b.key).length) || blocks[0])?.key || null;
  }
  const chosen = p.blockKey && m.block(p.blockKey);
  const due = m.effectiveDue(t);
  const late = chosen && due && new Date(chosen.end_at) > new Date(due);
  $("modal").innerHTML = `
    <h3>Commit: ${esc(t.title)}</h3>
    <p class="hint">Which day?</p>
    <div class="chips">${chips.map((d) => `<button class="chip ${d === p.date ? "on" : ""}" data-pick-day="${d}">${d === todayStr() ? "Today" : d === addDays(todayStr(), 1) ? "Tomorrow" : fmtDay(d)}</button>`).join("")}
      <input type="date" value="${p.date}" min="${days[0]}" max="${days.at(-1)}" data-pick-date aria-label="Other day"></div>
    <p class="hint">Which block?</p>
    <div class="blocklist">${blocks.map((b) => {
      const n = m.tasksInBlock(b.key).length;
      return `<label class="blockopt ${b.key === p.blockKey ? "on" : ""}"><input type="radio" name="blk" value="${b.key}" ${b.key === p.blockKey ? "checked" : ""}>
        <span>${m.blockLabel(b)}</span><span class="mono">${fmtTime(b.start_at)}–${fmtTime(b.end_at)}</span><span class="hint">${n ? `${n} task${n > 1 ? "s" : ""}` : "free"}</span></label>`;
    }).join("") || `<div class="hint">No blocks left that day.</div>`}</div>
    ${chosen ? `<div class="big">Done by ${fmtDay(chosen.date)} ${fmtTime(chosen.end_at)}</div>` : ""}
    ${late ? `<div class="warn" role="alert">⚠ That's after the deadline (${fmtDay(dayOf(due))} ${fmtTime(due)}).</div>` : ""}
    <div class="actions"><button class="btn" data-action="popup-cancel">Cancel</button>
      <button class="btn primary" data-action="popup-confirm" ${chosen ? "" : "disabled"}>Commit</button></div>`;
}

function closePopup() {
  view.pending = null;
  $("modal-bg").classList.remove("show");
}

async function confirmPopup() {
  const { taskId, blockKey } = view.pending;
  closePopup();
  await act(async () => {
    m.addPlacement(await db.place(taskId, blockKey));
    const t = m.task(taskId);
    if (t.status === "backlog" || t.status === "todo") m.replaceTask(await db.updateTask(taskId, { status: "in_progress" }));
    await syncProject(t.parent_id);
    const b = m.block(blockKey);
    toast(`Committed to ${fmtDay(b.date)} ${fmtTime(b.start_at)} block`);
    render();
  });
}

async function cancelPopup() {
  const { taskId, revertTo } = view.pending;
  closePopup();
  if (revertTo) {
    await act(async () => {
      m.replaceTask(await db.updateTask(taskId, { status: revertTo }));
      render();
    });
  }
}

// ---------- events ----------
document.addEventListener("click", async (e) => {
  if (await handleApprovalClick(e, m, { email: session.user.email, rerender: render, toast })) return;
  const a = e.target.closest("[data-action]");
  const dayChip = e.target.closest("[data-pick-day]");
  if (dayChip) {
    view.pending.date = dayChip.dataset.pickDay;
    view.pending.blockKey = null;
    return renderPopup();
  }
  if (e.target === $("modal-bg")) return view.spread ? closeSpread() : cancelPopup();
  if (!a) {
    const card = e.target.closest("[data-task]");
    if (card && !e.target.closest(".drawer")) openDrawer(card.dataset.task);
    return;
  }
  const t = view.openTask && m.task(view.openTask);
  switch (a.dataset.action) {
    case "signout": return signOut();
    case "prev": view.date = addDays(view.date, -1); return render();
    case "next": view.date = addDays(view.date, 1); return render();
    case "today": view.date = todayStr(); return render();
    case "close": return closeDrawer();
    case "popup-cancel": return cancelPopup();
    case "popup-confirm": return confirmPopup();
    case "commit": return openPlacePopup(t.id, { date: view.date });
    case "commit-part": return openPlacePopup(a.dataset.id, { date: view.date });
    case "open": return openDrawer(a.dataset.id);
    case "replace": return openPlacePopup(a.dataset.taskId, { date: a.dataset.date >= todayStr() ? a.dataset.date : null });
    case "spread": return openSpread(t.id);
    case "spread-cancel": return closeSpread();
    case "spread-approve": return approveSpread();
    case "split": {
      const n = Math.min(50, Math.max(2, parseInt(document.querySelector("[data-split-n]").value, 10) || 0));
      const name = document.querySelector("[data-split-name]").value.trim() || t.title;
      if (!confirm(`Create ${n} parts named “${name} (1/${n})” … “(${n}/${n})”?`)) return;
      return act(async () => {
        await addParts(t, Array.from({ length: n }, (_, i) => `${name} (${i + 1}/${n})`));
        toast(`${n} parts added`); render(); renderDrawer();
      });
    }
    case "to-parts":
      return act(async () => {
        const subs = m.subtasksOf(t.id).filter((x) => !x.done);
        await addParts(t, subs.map((x) => x.title));
        for (const x of subs) { await db.deleteSubtask(x.id); m.removeSubtask(x.id); }
        toast(`${subs.length} parts created`); render(); renderDrawer();
      });
    case "done": return markDone(t.id);
    case "clear-due":
      return act(async () => { m.replaceTask(await db.updateTask(t.id, { due_at: null, due_has_time: false })); render(); renderDrawer(); });
    case "unplace":
      return act(async () => {
        const p = m.placement(a.dataset.id), b = m.block(p.block_key);
        if (b && new Date(b.start_at) <= new Date()) m.replacePlacement(await db.updatePlacement(p.id, { outcome: "moved", resolved_at: new Date().toISOString() }));
        else { await db.deletePlacement(p.id); m.removePlacement(p.id); }
        render(); renderDrawer();
      });
    case "del-sub":
      return act(async () => { await db.deleteSubtask(a.dataset.id); m.removeSubtask(a.dataset.id); render(); renderDrawer(); });
    case "del-proof":
      if (!confirm("Delete this proof?")) return;
      return act(async () => { const p = m.proof(a.dataset.id); await db.deleteProof(p); m.removeProof(p.id); render(); renderDrawer(); });
    case "add-link": {
      const input = document.querySelector("[data-proofurl]");
      const url = input.value.trim();
      if (!/^https?:\/\//i.test(url)) return toast("Links need to start with http(s)://", true);
      return act(async () => {
        m.addProof(await db.addLinkProof(t.id, url, url.replace(/^https?:\/\//i, "").slice(0, 60)));
        render(); renderDrawer();
      });
    }
    case "delete": {
      const parts = m.partsOf(t.id);
      if (!confirm(`Delete “${t.title}”?${parts.length ? ` Its ${parts.length} parts are deleted too.` : ""} This also deletes subtasks, log and proof.`)) return;
      return act(async () => {
        for (const x of [t, ...parts]) {
          for (const p of m.proofsOf(x.id).filter((p) => p.storage_path)) await db.deleteProof(p);
        }
        await db.deleteTask(t.id);
        for (const x of parts) m.removeTask(x.id);
        m.removeTask(t.id);
        await syncProject(t.parent_id);
        closeDrawer();
        render();
      });
    }
  }
});

document.addEventListener("change", async (e) => {
  const el = e.target;
  if (el.matches("[data-pick-date]")) {
    if (el.value) { view.pending.date = el.value; view.pending.blockKey = null; renderPopup(); }
    return;
  }
  if (el.name === "blk") { view.pending.blockKey = el.value; return renderPopup(); }
  if (el.dataset.spreadDay) {
    const r = view.spread.rows[+el.dataset.spreadDay];
    r.date = el.value;
    r.blockKey = (m.placeableBlocks(r.date).find((b) => !m.tasksInBlock(b.key).length) || m.placeableBlocks(r.date)[0])?.key;
    return renderSpread();
  }
  if (el.dataset.spreadBlock) { view.spread.rows[+el.dataset.spreadBlock].blockKey = el.value; return renderSpread(); }
  const t = view.openTask && m.task(view.openTask);
  if (!t || !el.closest("#drawer")) return;
  if (el.matches("[data-photo]")) {
    const files = [...el.files];
    if (!files.length) return;
    toast(`Uploading ${files.length} file${files.length > 1 ? "s" : ""}…`);
    return act(async () => {
      for (const f of files) {
        const proof = await db.addPhotoProof(t.id, await prepareImage(f), f.name);
        m.addProof(proof);
      }
      view.urls = { ...view.urls, ...(await db.signedUrls(m.proofsOf(t.id).filter((p) => p.storage_path).map((p) => p.storage_path))) };
      toast("Proof added ✓");
      render(); renderDrawer();
    });
  }
  if (el.dataset.sub) return act(async () => { m.replaceSubtask(await db.updateSubtask(el.dataset.sub, { done: el.checked })); render(); });
  const field = el.dataset.field;
  let patch = null;
  if (field === "title" && el.value.trim()) patch = { title: el.value.trim() };
  if (field === "recap") patch = { recap: el.value };
  if (field === "proof_required") patch = { proof_required: el.checked };
  if (field === "tags") patch = { tags: el.value.split(",").map((s) => s.trim().replace(/^#/, "")).filter(Boolean) };
  if (field === "due-date" || field === "due-time") {
    const date = document.querySelector('[data-field="due-date"]').value;
    const time = document.querySelector('[data-field="due-time"]').value;
    patch = date ? { due_at: zonedToIso(date, time || "23:59"), due_has_time: Boolean(time) } : { due_at: null, due_has_time: false };
  }
  if (field === "status") return setStatus(t.id, el.value);
  // Saving a field fires on blur; redrawing the drawer then would swallow the click that caused the blur.
  if (patch) await act(async () => { m.replaceTask(await db.updateTask(t.id, patch)); render({ drawer: false }); });
});

document.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") return view.spread ? closeSpread() : view.pending ? cancelPopup() : closeDrawer();
  if (e.key === "Enter" && e.target.matches(".card, .proj")) return openDrawer(e.target.dataset.task);
  if (e.key !== "Enter" || !e.target.matches("input[type=text]")) return;
  const el = e.target, value = el.value.trim();
  if (!value) return;
  if (el.dataset.add) {
    el.value = "";
    return act(async () => { m.addTask(await db.createTask({ title: value, status: el.dataset.add, sort_order: Date.now() })); render(); });
  }
  const t = view.openTask && m.task(view.openTask);
  if (el.matches("[data-addpart]")) {
    el.value = "";
    return act(async () => { await addParts(t, [value]); render(); renderDrawer(); document.querySelector("[data-addpart]")?.focus(); });
  }
  if (el.matches("[data-split-name]")) return document.querySelector('[data-action="split"]').click();
  if (el.matches("[data-addsub]")) {
    el.value = "";
    return act(async () => { m.addSubtask(await db.addSubtask(t.id, value, Date.now())); render(); renderDrawer(); document.querySelector("[data-addsub]")?.focus(); });
  }
  if (el.matches("[data-addlog]")) {
    el.value = "";
    return act(async () => { view.log.push(await db.addLog(t.id, value)); renderDrawer(); document.querySelector("[data-addlog]")?.focus(); });
  }
  if (el.matches("[data-proofurl]")) return document.querySelector('[data-action="add-link"]').click();
});

// Drag and drop (desktop). On touch screens, use the drawer's status and "Commit to a block".
let dragId = null;
document.addEventListener("dragstart", (e) => {
  const c = e.target.closest?.(".card");
  if (!c) return;
  dragId = c.dataset.task;
  e.dataTransfer.setData("text/plain", dragId);
  e.dataTransfer.effectAllowed = "move";
});
document.addEventListener("dragover", (e) => {
  const z = e.target.closest?.("[data-drop-status],[data-drop-block]");
  if (!z || !dragId) return;
  if (z.dataset.dropBlock && m.blockPast(m.block(z.dataset.dropBlock))) return;
  e.preventDefault();
  z.classList.add("over");
});
document.addEventListener("dragleave", (e) => e.target.closest?.(".over")?.classList.remove("over"));
document.addEventListener("drop", (e) => {
  const z = e.target.closest?.("[data-drop-status],[data-drop-block]");
  document.querySelectorAll(".over").forEach((x) => x.classList.remove("over"));
  if (!z || !dragId) return;
  e.preventDefault();
  const id = dragId;
  dragId = null;
  if (z.dataset.dropBlock) return openPlacePopup(id, { blockKey: z.dataset.dropBlock });
  setStatus(id, z.dataset.dropStatus, { fromDrop: true });
});
document.addEventListener("dragend", () => (dragId = null));

// Keep both people's edits and the sync job's changes fresh.
window.addEventListener("focus", () => !view.pending && !view.spread && reload().catch(() => {}));
setInterval(() => !document.hidden && !view.pending && !view.spread && reload().catch(() => {}), 120000);
setInterval(() => !document.hidden && (renderTimeline(), renderCounter()), 60000);

await reload();
if (params.get("task") && m.task(params.get("task"))) openDrawer(params.get("task"));
