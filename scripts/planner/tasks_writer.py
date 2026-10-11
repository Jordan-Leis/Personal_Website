"""Write committed tasks into Work Block descriptions, and settle finished commitments.

Titles of blocks never change ("Work"); only the description's task list does.
"""
from __future__ import annotations

import datetime as dt

from .reconcile import DEFAULT_DESCRIPTION
from .supa import Supabase

ICONS = {"planned": "☐", "done": "✓", "missed": "✗"}
FOOTER = "— managed by jordanleis.com/to-do"


def settle_outcomes(placements: list[dict], tasks: dict, block_ends: dict, now: dt.datetime) -> list[dict]:
    """Planned placements whose task is done, or whose block has ended, get a final outcome."""
    updates = []
    for p in placements:
        if p["outcome"] != "planned":
            continue
        task, end = tasks.get(p["task_id"]), block_ends.get(p["block_key"])
        if task and task["status"] == "done":
            updates.append({"id": p["id"], "outcome": "done", "resolved_at": now.isoformat()})
        elif end and end <= now:
            updates.append({"id": p["id"], "outcome": "missed", "resolved_at": end.isoformat()})
    return updates


def describe(lines: list[str]) -> str:
    if not lines:
        return DEFAULT_DESCRIPTION
    return "Tasks:\n" + "\n".join(lines) + "\n\n" + FOOTER


def task_line(task: dict, outcome: str, subtasks: list[dict]) -> str:
    extras = []
    if subtasks:
        extras.append(f"{sum(s['done'] for s in subtasks)}/{len(subtasks)} subtasks")
    if task.get("due_at") and task["status"] != "done":
        due = dt.datetime.fromisoformat(task["due_at"])
        extras.append("due " + due.strftime("%a %b %-d" + (" %-I:%M %p" if task.get("due_has_time") else "")))
    return f"{ICONS.get(outcome, '☐')} {task['title']}" + (f"  ({', '.join(extras)})" if extras else "")


def plan_descriptions(events: list[dict], placements: list[dict], tasks: dict, subtasks: list[dict]) -> list[tuple[str, str]]:
    """(event id, new description) for Work/Self blocks whose task list changed."""
    by_block: dict[str, list[dict]] = {}
    for p in placements:
        if p["outcome"] != "moved" and p["task_id"] in tasks:
            by_block.setdefault(p["block_key"], []).append(p)
    subs_by_task: dict[str, list[dict]] = {}
    for s in subtasks:
        subs_by_task.setdefault(s["task_id"], []).append(s)

    changes = []
    for e in events:
        props = e["extendedProperties"]["private"]
        if props["kind"] not in ("work", "self"):
            continue
        ps = sorted(by_block.get(props["blockKey"], []), key=lambda p: p["placed_at"])
        lines = [task_line(tasks[p["task_id"]], p["outcome"], subs_by_task.get(p["task_id"], [])) for p in ps]
        desired = describe(lines)
        if (e.get("description") or "") != desired:
            changes.append((e["id"], desired))
    return changes


def run(db: Supabase, service, calendar_id: str, block_events: list[dict], now: dt.datetime) -> dict:
    tasks = {t["id"]: t for t in db.select("tasks", {"select": "id,title,status,due_at,due_has_time"})}
    placements = db.select("placements", {"select": "id,task_id,block_key,outcome,placed_at"})
    subtasks = db.select("subtasks", {"select": "task_id,done"})
    block_ends = {
        e["extendedProperties"]["private"]["blockKey"]: dt.datetime.fromisoformat(e["end"]["dateTime"])
        for e in block_events
    }

    settled = settle_outcomes(placements, tasks, block_ends, now)
    for u in settled:
        db.update("placements", {"id": f"eq.{u['id']}"}, {"outcome": u["outcome"], "resolved_at": u["resolved_at"]})
    outcome_by_id = {u["id"]: u["outcome"] for u in settled}
    for p in placements:
        p["outcome"] = outcome_by_id.get(p["id"], p["outcome"])

    changes = plan_descriptions(block_events, placements, tasks, subtasks)
    if changes:
        batch = service.new_batch_http_request()
        for i, (event_id, description) in enumerate(changes):
            batch.add(service.events().patch(calendarId=calendar_id, eventId=event_id, body={"description": description}))
            if (i + 1) % 50 == 0:
                batch.execute()
                batch = service.new_batch_http_request()
        batch.execute()
    return {"settled": len(settled), "descriptions": len(changes)}
