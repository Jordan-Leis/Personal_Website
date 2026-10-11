// Planner state plus the derived rules (commitments, slips, proof gate). No DOM here.
export const TZ = "America/Toronto";
export const COLUMNS = [["backlog", "Backlog"], ["todo", "To Do"], ["in_progress", "In Progress"], ["done", "Done"]];
export const KIND_LABEL = { work: "Work", self: "Self-improvement", lunch: "Lunch", dinner: "Dinner" };

// ---------- time helpers (always Toronto time, whatever the device's zone) ----------
const partsFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
function parts(date) {
  const p = Object.fromEntries(partsFmt.formatToParts(date).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, h: +p.hour, min: +p.minute, y: +p.year, mo: +p.month, d: +p.day };
}
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const todayStr = () => parts(new Date()).date;
export const dayOf = (iso) => parts(new Date(iso)).date;
export const minOf = (iso) => { const p = parts(new Date(iso)); return p.h * 60 + p.min; };
export const addDays = (ds, n) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + n)).toISOString().slice(0, 10);
};
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" });
export const fmtDay = (ds) => {
  const [y, mo, d] = ds.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, 12)).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).replace(",", "");
};
// Toronto wall-clock date + "HH:MM" -> ISO instant.
export function zonedToIso(ds, hhmm) {
  const [y, mo, d] = ds.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = parts(new Date(guess));
  const offset = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.min) - guess;
  return new Date(guess - offset).toISOString();
}
export function isoToLocalInputs(iso, hasTime) {
  if (!iso) return { date: "", time: "" };
  const p = parts(new Date(iso));
  return { date: p.date, time: hasTime ? `${String(p.h).padStart(2, "0")}:${String(p.min).padStart(2, "0")}` : "" };
}

export class Model {
  constructor() {
    this.set({ tasks: [], subtasks: [], proofs: [], placements: [], blocks: [], events: [] });
  }

  set(data) {
    Object.assign(this, data);
    this.blockMap = Object.fromEntries(this.blocks.map((b) => [b.key, b]));
  }

  // ---------- lookups ----------
  task(id) { return this.tasks.find((t) => t.id === id); }
  block(key) { return this.blockMap[key]; }
  placement(id) { return this.placements.find((p) => p.id === id); }
  proof(id) { return this.proofs.find((p) => p.id === id); }
  subtasksOf(id) { return this.subtasks.filter((s) => s.task_id === id); }
  proofsOf(id) { return this.proofs.filter((p) => p.task_id === id); }
  placementsOf(id) {
    return this.placements.filter((p) => p.task_id === id)
      .sort((a, b) => (this.block(a.block_key)?.start_at || "").localeCompare(this.block(b.block_key)?.start_at || ""));
  }

  tasksIn(status) {
    const list = this.tasks.filter((t) => t.status === status);
    if (status === "done") return list.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
    return list.sort((a, b) =>
      (a.due_at ? 0 : 1) - (b.due_at ? 0 : 1) || (a.due_at || "").localeCompare(b.due_at || "") || a.sort_order - b.sort_order);
  }

  // ---------- commitments ----------
  blockPast(b) { return !b || new Date(b.end_at) <= new Date(); }
  blockNow(b) { const n = new Date(); return new Date(b.start_at) <= n && n < new Date(b.end_at); }

  // planned | done | missed | moved | orphan (its block was regenerated away)
  outcome(p) {
    if (p.outcome !== "planned") return p.outcome;
    const t = this.task(p.task_id), b = this.block(p.block_key);
    if (t?.status === "done") return "done";
    if (!b) return "orphan";
    return this.blockPast(b) ? "missed" : "planned";
  }
  plannedFor(id) { return this.placementsOf(id).filter((p) => this.outcome(p) === "planned"); }
  slipped(id) { return this.placementsOf(id).filter((p) => this.outcome(p) === "missed").length; }
  orphans(id) { return this.placementsOf(id).filter((p) => this.outcome(p) === "orphan").length; }

  doneBy(id) {
    const last = this.plannedFor(id).map((p) => this.block(p.block_key)).sort((a, b) => a.end_at.localeCompare(b.end_at)).at(-1);
    if (!last) return null;
    return (last.date === todayStr() ? "" : fmtDay(last.date) + " ") + fmtTime(last.end_at);
  }

  hasProof(t) { return !t.proof_required || this.proofsOf(t.id).length > 0 || t.recap.trim().length > 0; }

  urgency(t) {
    const ms = new Date(t.due_at) - new Date();
    if (t.status !== "done" && ms < 0) return "overdue";
    if (ms < 864e5) return "soon";
    if (ms < 3 * 864e5) return "near";
    return "later";
  }

  tasksInBlock(key) {
    return this.placements.filter((p) => p.block_key === key && p.outcome !== "moved")
      .map((p) => ({ task: this.task(p.task_id), outcome: this.outcome(p) }))
      .filter((x) => x.task);
  }

  saidVsDid(today) {
    const [y, mo, d] = today.split("-").map(Number);
    const monday = addDays(today, -((new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7));
    const week = new Set(Array.from({ length: 7 }, (_, i) => addDays(monday, i)));
    const count = (pred) => {
      const ps = this.placements.filter((p) => p.outcome !== "moved" && this.task(p.task_id) && pred(this.block(p.block_key)));
      return { total: ps.length, done: ps.filter((p) => this.outcome(p) === "done").length };
    };
    return { today: count((b) => b?.date === today), week: count((b) => b && week.has(b.date)) };
  }

  // ---------- calendar ----------
  blocksOn(d) { return this.blocks.filter((b) => b.date === d); }
  eventsOn(d) { return this.events.filter((e) => dayOf(e.start_at) === d); }
  dueOn(d) { return this.tasks.filter((t) => t.status !== "done" && t.due_at && dayOf(t.due_at) === d); }
  blockLabel(b) {
    if (b.kind !== "work") return KIND_LABEL[b.kind];
    const same = this.blocks.filter((x) => x.date === b.date && x.kind === "work");
    return `Work ${same.findIndex((x) => x.key === b.key) + 1}`;
  }
  placeableBlocks(d) { return this.blocksOn(d).filter((b) => (b.kind === "work" || b.kind === "self") && !this.blockPast(b)); }
  placeableDays() {
    return [...new Set(this.blocks.filter((b) => (b.kind === "work" || b.kind === "self") && !this.blockPast(b)).map((b) => b.date))].sort();
  }

  // ---------- local mutations (mirror what was just written to Supabase) ----------
  patchTask(id, patch) { Object.assign(this.task(id), patch); }
  replaceTask(row) { this.tasks = this.tasks.map((t) => (t.id === row.id ? row : t)); }
  addTask(row) { this.tasks.push(row); }
  removeTask(id) {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.subtasks = this.subtasks.filter((s) => s.task_id !== id);
    this.proofs = this.proofs.filter((p) => p.task_id !== id);
    this.placements = this.placements.filter((p) => p.task_id !== id);
  }
  addSubtask(row) { this.subtasks.push(row); }
  replaceSubtask(row) { this.subtasks = this.subtasks.map((s) => (s.id === row.id ? row : s)); }
  removeSubtask(id) { this.subtasks = this.subtasks.filter((s) => s.id !== id); }
  addProof(row) { this.proofs.push(row); }
  removeProof(id) { this.proofs = this.proofs.filter((p) => p.id !== id); }
  addPlacement(row) { this.placements.push(row); }
  replacePlacement(row) { this.placements = this.placements.map((p) => (p.id === row.id ? row : p)); }
  removePlacement(id) { this.placements = this.placements.filter((p) => p.id !== id); }
}
