// "Needs your approval": suggested event ignores and commitments that lost their block.
// Nothing here changes a calendar until someone clicks Approve.
import * as db from "./data.js";
import { esc, dayOf, fmtDay, fmtTime } from "./model.js";

const open = new Set(); // reasons whose item list is expanded

const span = (items) => {
  const days = items.map((o) => dayOf(o.start_at)).sort();
  return days[0] === days.at(-1) ? fmtDay(days[0]) : `${fmtDay(days[0])} – ${fmtDay(days.at(-1))}`;
};

// `replaceLink(task, placement)` returns the HTML for the "Re-place" control on each page.
export function approvalsHTML(m, replaceLink) {
  const groups = m.suggestionGroups(), orphans = m.orphanCommitments();
  if (!groups.length && !orphans.length) return "";
  return `<h2>Needs your approval</h2>
    ${groups.map(({ reason, items }) => `
      <div class="approval">
        <div><b>Ignore ${items.length} event${items.length > 1 ? "s" : ""} during ${esc(reason)}</b> <span class="hint">(${span(items)})</span></div>
        <div class="hint">They'd stop counting as busy and hide from the planner. Nothing is deleted from the source calendar.</div>
        <div class="opts">
          <button class="btn small" data-appr-toggle="${esc(reason)}">${open.has(reason) ? "Hide list" : "Review"}</button>
          <button class="btn small primary" data-appr-all="approved" data-reason="${esc(reason)}">Approve all</button>
          <button class="btn small ghost" data-appr-all="dismissed" data-reason="${esc(reason)}">Dismiss all</button>
        </div>
        ${open.has(reason) ? `<ul class="appr-list">${items.map((o) => `
          <li><span>${fmtDay(dayOf(o.start_at))} ${fmtTime(o.start_at)} · ${esc(o.title)}</span>
            <span><button class="btn small" data-appr-one="approved" data-key="${o.event_key}">Ignore</button>
            <button class="btn small ghost" data-appr-one="dismissed" data-key="${o.event_key}">Keep</button></span></li>`).join("")}</ul>` : ""}
      </div>`).join("")}
    ${orphans.map(({ placement, task }) => `
      <div class="approval warnline">
        <div><b>${esc(task.title)}</b> lost its block <span class="hint">(${esc(placement.block_key.split(":")[0])}: the schedule changed)</span></div>
        <div class="opts">${replaceLink(task, placement)}</div>
      </div>`).join("")}`;
}

// Returns true when the click was an approvals control (and handles it).
export async function handleApprovalClick(e, m, { email, rerender, toast }) {
  const toggle = e.target.closest("[data-appr-toggle]");
  const all = e.target.closest("[data-appr-all]");
  const one = e.target.closest("[data-appr-one]");
  if (toggle) {
    const r = toggle.dataset.apprToggle;
    open.has(r) ? open.delete(r) : open.add(r);
    rerender();
    return true;
  }
  if (!all && !one) return false;
  const status = (all || one).dataset[all ? "apprAll" : "apprOne"];
  const keys = all
    ? m.suggestionGroups().find((g) => g.reason === all.dataset.reason).items.map((o) => o.event_key)
    : [one.dataset.key];
  try {
    await db.setOverrides(keys, status, email);
    for (const k of keys) {
      const o = m.override(k);
      if (o) o.status = status;
    }
    toast(status === "approved" ? "Approved: blocks adjust at the next sync" : "Kept as busy");
    rerender();
  } catch (err) {
    toast(err.message, true);
  }
  return true;
}
