"""Mirror Work Blocks events and busy events into Supabase for the web pages."""
from __future__ import annotations

import datetime as dt
import hashlib

from .blocks import Busy
from .reconcile import event_to_block
from .supa import Supabase


def busy_id(b: Busy) -> str:
    raw = f"{b.source}|{b.title}|{b.start.isoformat()}|{b.end.isoformat()}"
    return hashlib.sha1(raw.encode()).hexdigest()[:24]


def block_rows(events: list[dict]) -> list[dict]:
    rows = []
    for e in events:
        b = event_to_block(e)
        rows.append({
            "key": b.key, "date": b.date.isoformat(), "kind": b.kind,
            "start_at": b.start.isoformat(), "end_at": b.end.isoformat(),
            "gcal_event_id": e["id"], "active": True,
        })
    return rows


def event_rows(busy: list[Busy]) -> list[dict]:
    rows = {}
    for b in busy:
        rows[busy_id(b)] = {
            "id": busy_id(b), "source": b.source, "title": b.title,
            "start_at": b.start.isoformat(), "end_at": b.end.isoformat(),
            "auto_added": b.title.startswith("[Auto]"),
        }
    return list(rows.values())


def _stale(db: Supabase, table: str, id_col: str, time_col: str, start: dt.datetime, end: dt.datetime, keep: set) -> list[str]:
    existing = db.select(table, {
        "select": id_col,
        "and": f"({time_col}.gte.{start.isoformat()},{time_col}.lt.{end.isoformat()})",
    })
    return [r[id_col] for r in existing if r[id_col] not in keep]


def mirror(db: Supabase, block_events: list[dict], busy: list[Busy], start: dt.datetime, end: dt.datetime) -> dict:
    """Upsert everything in [start, end) and delete rows in that window that no longer exist."""
    blocks, events = block_rows(block_events), event_rows(busy)
    db.upsert("blocks", blocks, "key")
    db.upsert("calendar_events", events, "id")
    stale_blocks = _stale(db, "blocks", "key", "start_at", start, end, {r["key"] for r in blocks})
    stale_events = _stale(db, "calendar_events", "id", "start_at", start, end, {r["id"] for r in events})
    db.delete_in("blocks", "key", stale_blocks)
    db.delete_in("calendar_events", "id", stale_events)
    return {"blocks": len(blocks), "events": len(events), "removed": len(stale_blocks) + len(stale_events)}
