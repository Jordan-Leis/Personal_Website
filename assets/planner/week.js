// /schedule: the week view. Every source on one grid, plus the email "Needs your pick" queue.
import { requireMember, signOut } from "./auth.js";
import * as db from "./data.js";
import { esc, todayStr, addDays, dayOf, minOf, fmtTime, fmtDay, Model, KIND_LABEL } from "./model.js";
import { approvalsHTML, handleApprovalClick } from "./approvals.js";

const app = document.getElementById("app");
const session = await requireMember(app);

const m = new Model();
const params = new URLSearchParams(location.search);
const mondayOf = (ds) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return addDays(ds, -((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7));
};
const view = {
  week: mondayOf(/^\d{4}-\d{2}-\d{2}$/.test(params.get("week") || "") ? params.get("week") : todayStr()),
  reviews: [],
  selected: null, // { type: "block", key } | { type: "event", id }
  showIgnored: false,
};

app.innerHTML = `
  <div class="topbar">
    <span class="brand">jordanleis.com/schedule</span>
    <nav class="tabs"><a class="tab" href="/to-do/">Today</a><a class="tab active" href="/schedule/">Week</a></nav>
    <div class="stepper">
      <button class="btn" data-action="prev" aria-label="Previous week">‹</button>
      <button class="btn" data-action="this">This week</button>
      <button class="btn" data-action="next" aria-label="Next week">›</button>
    </div>
    <div class="spacer"></div>
    <span class="counter" id="counter"></span>
    <span class="who">● ${esc(session.user.email)}</span>
    <button class="btn" data-action="signout">Sign out</button>
  </div>
  <main class="sched">
    <section class="panel week-panel"><div class="row between"><h2 id="week-title"></h2>
      <label class="check hint"><input type="checkbox" data-action="toggle-ignored"> Show ignored events</label></div><div class="week-scroll"><div class="week" id="week"></div></div></section>
    <aside class="side">
      <div class="panel approvals" id="approvals" hidden></div>
      <div class="panel"><h2>Needs your pick (from email)</h2><div id="reviews"></div></div>
      <div class="panel"><h2>Details</h2><div id="details" class="hint">Click a block or event.</div></div>
      <div class="panel"><h2>This week</h2><div id="stats" class="mono"></div></div>
      <div class="panel legend"><h2>Sources</h2>
        <div><i style="background:var(--c-class)"></i>UW classes (Portal)</div>
        <div><i style="background:var(--c-personal)"></i>Google calendar / Outlook</div>
        <div><i style="background:var(--c-ai)"></i>Added automatically from email</div>
        <div><i class="ol" style="border-color:var(--orange)"></i>Work block (tasks inside)</div>
        <div><i class="ol" style="border-color:#ad7fa8"></i>Self-improvement</div>
        <div><i style="background:var(--c-meal)"></i>Lunch / dinner</div>
        <div><i class="due"></i>Deadline</div>
      </div>
    </aside>
  </main>
  <div class="toast" id="toast" role="status"></div>`;

const $ = (id) => document.getElementById(id);
function toast(msg, isError = false) {
  const t = $("toast");
  t.textContent = msg;
  t.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.className = "toast"), isError ? 6000 : 2500);
}

async function reload() {
  const [data, reviews] = await Promise.all([db.loadAll(), db.loadReviewItems()]);
  m.set(data);
  view.reviews = reviews;
  render();
}

const TL_START = 8 * 60, TL_END = 23 * 60;
const pos = (s, e) => `top:calc(var(--ppm)*${Math.max(s, TL_START) - TL_START}px);height:calc(var(--ppm)*${Math.max(14, Math.min(e, TL_END) - Math.max(s, TL_START))}px)`;
const ICON = { planned: "•", done: "✓", missed: "✗", orphan: "?" };
const days = () => Array.from({ length: 7 }, (_, i) => addDays(view.week, i));
const todoLink = (date, taskId) => `/to-do/?date=${date}${taskId ? `&task=${taskId}` : ""}`;

function renderWeek() {
  const ds = days(), today = todayStr();
  $("week-title").textContent = `Week of ${fmtDay(view.week)}`;
  let h = `<div class="wk-h"></div>` + ds.map((d) =>
    `<a class="wk-h ${d === today ? "today" : ""}" href="${todoLink(d)}" title="Open this day in /to-do">${fmtDay(d)}</a>`).join("");
  h += `<div class="hours">` + Array.from({ length: 16 }, (_, i) =>
    `<div style="top:calc(var(--ppm)*${i * 60}px)">${(i + 8) % 12 || 12}${i + 8 < 12 ? "a" : "p"}</div>`).join("") + `</div>`;
  for (const d of ds) {
    h += `<div class="daycol">`;
    const ignored = view.showIgnored ? m.ignoredEvents().filter((e) => dayOf(e.start_at) === d) : [];
    for (const e of [...m.eventsOn(d), ...ignored]) {
      const cls = (e.auto_added ? "ai" : e.source === "portal" ? "class" : "personal") + (m.isIgnored(e) ? " ignored" : "");
      const sel = view.selected?.type === "event" && view.selected.id === e.id ? " sel" : "";
      h += `<button class="ev ${cls}${sel}" data-event="${e.id}" style="${pos(minOf(e.start_at), minOf(e.end_at))}">${e.auto_added ? '<span class="badge ai">AUTO</span> ' : ""}${esc(e.title.replace(/^\[Auto\]\s*/, ""))}</button>`;
    }
    for (const b of m.blocksOn(d)) {
      const st = pos(minOf(b.start_at), minOf(b.end_at));
      const sel = view.selected?.type === "block" && view.selected.key === b.key ? " sel" : "";
      if (b.kind === "work" || b.kind === "self") {
        const items = m.tasksInBlock(b.key);
        h += `<button class="ev blk ${b.kind}${m.blockPast(b) ? " past" : ""}${sel}" data-block="${b.key}" style="${st}">
          <span class="bh">${m.blockLabel(b)}</span>${items.map(({ task, outcome }) => `<span class="tk">${ICON[outcome]} ${esc(task.title)}</span>`).join("")}</button>`;
      } else {
        h += `<div class="ev meal" style="${st}">${KIND_LABEL[b.kind]}</div>`;
      }
    }
    for (const t of m.dueOn(d)) {
      const at = t.due_has_time ? minOf(t.due_at) : TL_END - 4;
      h += `<a class="due-line" href="${todoLink(d, t.id)}" style="top:calc(var(--ppm)*${Math.min(at, TL_END) - TL_START}px)"><span>⚑ ${esc(t.title)}</span></a>`;
    }
    if (d === today) {
      const now = minOf(new Date().toISOString());
      if (now >= TL_START && now <= TL_END) h += `<div class="nowline" style="top:calc(var(--ppm)*${now - TL_START}px)"></div>`;
    }
    h += `</div>`;
  }
  $("week").innerHTML = h;
}

function describe(key) {
  const items = m.tasksInBlock(key);
  const lines = items.map(({ task, outcome }) => `${{ planned: "☐", done: "✓", missed: "✗", orphan: "☐" }[outcome]} ${task.title}`);
  return lines.length ? `Tasks:\n${lines.join("\n")}\n\n— managed by jordanleis.com/to-do` : "Tasks:\n(none yet)\n\n— managed by jordanleis.com/to-do";
}

function renderDetails() {
  const s = view.selected, el = $("details");
  if (!s) { el.className = "hint"; el.textContent = "Click a block or event."; return; }
  el.className = "";
  if (s.type === "block") {
    const b = m.block(s.key);
    if (!b) { view.selected = null; return renderDetails(); }
    const items = m.tasksInBlock(b.key);
    el.innerHTML = `<div class="det-h">${m.blockLabel(b)} · ${fmtDay(b.date)} ${fmtTime(b.start_at)}–${fmtTime(b.end_at)}</div>
      ${items.map(({ task }) => `<div><a href="${todoLink(b.date, task.id)}">${esc(task.title)}</a></div>`).join("") || `<div class="hint">No tasks committed.</div>`}
      <div class="hint mt">Google Calendar description:</div><pre class="gdesc">${esc(`Title: ${KIND_LABEL[b.kind]} (unchanged)\n\n` + describe(b.key))}</pre>
      ${m.blockPast(b) ? "" : `<a class="btn" href="${todoLink(b.date)}">Plan this day →</a>`}`;
  } else {
    const e = m.events.find((x) => x.id === s.id);
    if (!e) { view.selected = null; return renderDetails(); }
    const source = { portal: "UW Portal (classes)", outlook: "UW Outlook", google: "Google calendar" }[e.source] || e.source;
    const ignored = m.isIgnored(e), o = m.override(e.id);
    el.innerHTML = `<div class="det-h">${esc(e.title)}</div>
      <div>${fmtDay(dayOf(e.start_at))} ${fmtTime(e.start_at)}–${fmtTime(e.end_at)}</div>
      <div class="hint">${source}${e.auto_added ? " · added automatically from email" : ""}</div>
      ${ignored
        ? `<div class="hint mt">Ignored (${esc(o.reason)}): not counted as busy.</div><button class="btn mt" data-action="restore">Restore</button>`
        : `<button class="btn mt" data-action="ignore">Ignore this event…</button>
           <div class="hint">Stops it counting as busy and hides it here. The source calendar isn't changed.</div>`}`;
  }
}

function renderReviews() {
  const el = $("reviews");
  if (!view.reviews.length) {
    el.innerHTML = `<div class="hint">Nothing to pick. Emails offering several times, or booking links, show up here.</div>`;
    return;
  }
  el.innerHTML = view.reviews.map((r) => `
    <div class="review">
      <b>${esc(r.subject || "(no subject)")}</b>
      <span class="hint">${esc(r.sender)}${r.received_at ? " · " + fmtDay(dayOf(r.received_at)) : ""}</span>
      <div class="opts">
        ${(r.candidates || []).map((c, i) => `<button class="btn small" data-accept="${r.id}" data-i="${i}">${fmtDay(dayOf(c.start))} ${fmtTime(c.start)}</button>`).join("")}
        <a class="btn small" href="https://mail.google.com/mail/u/0/#all/${encodeURIComponent(r.gmail_message_id)}" target="_blank" rel="noopener">Open email</a>
        <button class="btn small ghost" data-dismiss="${r.id}">Dismiss</button>
      </div>
    </div>`).join("");
}

function renderStats() {
  const ds = new Set(days());
  const hours = { work: 0, self: 0 };
  for (const b of m.blocks) if (ds.has(b.date) && b.kind in hours) hours[b.kind] += (new Date(b.end_at) - new Date(b.start_at)) / 36e5;
  const ps = m.placements.filter((p) => p.outcome !== "moved" && ds.has(m.block(p.block_key)?.date) && m.task(p.task_id));
  const by = (o) => ps.filter((p) => m.outcome(p) === o).length;
  $("stats").innerHTML = `Work blocks ${hours.work.toFixed(1)}h · Self ${hours.self.toFixed(1)}h<br>
    Committed ${ps.length} · done ${by("done")} · missed ${by("missed")} · upcoming ${by("planned")}`;
  const c = m.saidVsDid(todayStr());
  $("counter").textContent = `said→did · today ${c.today.done}/${c.today.total} · week ${c.week.done}/${c.week.total}`;
}

function renderApprovals() {
  const html = approvalsHTML(m, (task, p) =>
    `<a class="btn small primary" href="${todoLink(p.block_key.split(":")[0] >= todayStr() ? p.block_key.split(":")[0] : todayStr(), task.id)}">Re-place in /to-do</a>`);
  $("approvals").hidden = !html;
  $("approvals").innerHTML = html;
}

function render() {
  renderApprovals();
  renderWeek();
  renderDetails();
  renderReviews();
  renderStats();
}

async function setIgnored(e, ignore) {
  try {
    if (ignore) {
      await db.ignoreEvent(e, session.user.email);
      const o = m.override(e.id);
      if (o) Object.assign(o, { status: "approved", reason: "ignored by hand" });
      else m.overrides.push({ event_key: e.id, status: "approved", reason: "ignored by hand" });
    } else {
      await db.setOverrides([e.id], "dismissed", session.user.email);
      m.override(e.id).status = "dismissed";
    }
    toast(ignore ? "Ignored: blocks adjust at the next sync" : "Restored: counts as busy again at the next sync");
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

document.addEventListener("click", async (e) => {
  if (await handleApprovalClick(e, m, { email: session.user.email, rerender: render, toast })) return;
  const a = e.target.closest("[data-action]");
  const blk = e.target.closest("[data-block]"), ev = e.target.closest("[data-event]");
  const accept = e.target.closest("[data-accept]"), dismiss = e.target.closest("[data-dismiss]");
  if (blk) { view.selected = { type: "block", key: blk.dataset.block }; return render(); }
  if (ev) { view.selected = { type: "event", id: ev.dataset.event }; return render(); }
  if (accept || dismiss) {
    const id = (accept || dismiss).dataset[accept ? "accept" : "dismiss"];
    const item = view.reviews.find((r) => r.id === id);
    const c = accept && item.candidates[+accept.dataset.i];
    try {
      await db.updateReviewItem(id, accept
        ? { status: "accepted", chosen_start: c.start, chosen_end: c.end || null }
        : { status: "dismissed" });
      view.reviews = view.reviews.filter((r) => r.id !== id);
      toast(accept ? "Added: it lands on your calendar at the next sync" : "Dismissed");
      renderReviews();
    } catch (err) {
      toast(err.message, true);
    }
    return;
  }
  if (!a) return;
  const sel = view.selected?.type === "event" && m.events.find((x) => x.id === view.selected.id);
  switch (a.dataset.action) {
    case "signout": return signOut();
    case "toggle-ignored": view.showIgnored = a.checked; return renderWeek();
    case "ignore":
      if (sel && confirm(`Ignore “${sel.title}” on ${fmtDay(dayOf(sel.start_at))}? It stops counting as busy; you can restore it any time.`)) setIgnored(sel, true);
      return;
    case "restore": return sel && setIgnored(sel, false);
    case "prev": view.week = addDays(view.week, -7); break;
    case "next": view.week = addDays(view.week, 7); break;
    case "this": view.week = mondayOf(todayStr()); break;
  }
  history.replaceState(null, "", `?week=${view.week}`);
  render();
});

window.addEventListener("focus", () => reload().catch(() => {}));
setInterval(() => !document.hidden && reload().catch(() => {}), 120000);
setInterval(() => !document.hidden && renderWeek(), 60000);

try {
  await reload();
} catch (err) {
  toast(err.message, true);
}
