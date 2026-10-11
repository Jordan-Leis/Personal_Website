"""Approval-gated event ignores. Suggestions are written; only approved rows filter busy time."""
from __future__ import annotations

from .blocks import Busy, suggest_ignore_reason
from .mirror import busy_id
from .supa import Supabase


def new_suggestions(busy: list[Busy], rules: dict, known_keys: set[str]) -> list[dict]:
    rows = {}
    for b in busy:
        key = busy_id(b)
        reason = suggest_ignore_reason(b, rules)
        if reason and key not in known_keys:
            rows[key] = {
                "event_key": key, "source": b.source, "title": b.title,
                "start_at": b.start.isoformat(), "end_at": b.end.isoformat(),
                "reason": reason, "status": "suggested",
            }
    return list(rows.values())


def effective_busy(busy: list[Busy], approved: dict[str, str]) -> list[Busy]:
    return [b for b in busy if busy_id(b) not in approved]


def sync(db: Supabase, busy: list[Busy], rules: dict, write: bool = True) -> tuple[dict[str, str], int]:
    """Record new suggestions; return ({event_key: reason} for approved ignores, suggestions found)."""
    rows = db.select("event_overrides", {"select": "event_key,status,reason"})
    suggestions = new_suggestions(busy, rules, {r["event_key"] for r in rows})
    if suggestions and write:
        db.upsert("event_overrides", suggestions, "event_key")
    approved = {r["event_key"]: r["reason"] for r in rows if r["status"] == "approved"}
    return approved, len(suggestions)
