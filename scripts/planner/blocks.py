"""Pure block generation: busy events + rules -> Work / Self-improvement / meal blocks.

No I/O here so the rules can be unit-tested. Keys are assigned separately by
assign_keys() so that blocks keep their identity when the schedule shifts.
"""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, replace
from pathlib import Path
from zoneinfo import ZoneInfo

import yaml

RULES_PATH = Path(__file__).with_name("rules.yaml")
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
TITLES = {"work": "Work", "self": "Self-improvement", "lunch": "Lunch", "dinner": "Dinner"}
QUARTER = dt.timedelta(minutes=15)


@dataclass(frozen=True)
class Busy:
    start: dt.datetime
    end: dt.datetime
    title: str = ""
    source: str = ""


@dataclass(frozen=True)
class Block:
    kind: str
    start: dt.datetime
    end: dt.datetime
    key: str = ""

    @property
    def date(self) -> dt.date:
        return self.start.date()

    @property
    def title(self) -> str:
        return TITLES[self.kind]

    @property
    def minutes(self) -> int:
        return int((self.end - self.start).total_seconds() // 60)


def load_rules(path: Path = RULES_PATH) -> dict:
    with open(path) as f:
        return yaml.safe_load(f)


def _to_date(value) -> dt.date:
    return value if isinstance(value, dt.date) else dt.date.fromisoformat(str(value))


def _at(day: dt.date, hhmm: str, tz: ZoneInfo) -> dt.datetime:
    h, m = map(int, hhmm.split(":"))
    return dt.datetime.combine(day, dt.time(h, m), tzinfo=tz)


def _overlaps(start, end, intervals) -> bool:
    return any(s < end and start < e for s, e in intervals)


def _free_gaps(lo, hi, intervals):
    """Free [start, end) gaps inside [lo, hi) given busy intervals."""
    gaps, cur = [], lo
    for s, e in sorted(intervals):
        if e <= cur or s >= hi:
            continue
        if s > cur:
            gaps.append((cur, s))
        cur = max(cur, e)
    if cur < hi:
        gaps.append((cur, hi))
    return gaps


def _place_meal(day, spec, search_minutes, intervals, tz):
    length = dt.timedelta(minutes=spec["minutes"])
    preferred = _at(day, spec["start"], tz)
    if not _overlaps(preferred, preferred + length, intervals):
        return preferred, preferred + length
    # Nearest free quarter-hour start; ties go to the later slot.
    base = preferred.replace(minute=preferred.minute - preferred.minute % 15)
    steps = search_minutes // 15
    candidates = sorted(
        (base + i * QUARTER for i in range(-steps, steps + 1)),
        key=lambda c: (abs((c - preferred).total_seconds()), -c.timestamp()),
    )
    for c in candidates:
        if c.date() == day and not _overlaps(c, c + length, intervals):
            return c, c + length
    return None


def suggest_ignore_reason(busy: Busy, rules: dict) -> str | None:
    """Why this event looks ignorable (it falls in a declared break), or None.

    Only a suggestion: an event stops counting as busy once its override is approved.
    """
    day = busy.start.date()
    for r in rules.get("ignore_ranges", []):
        if r.get("source") == busy.source and _to_date(r["start"]) <= day <= _to_date(r["end"]):
            return r.get("reason", "ignored")
    return None


def generate_day(day: dt.date, busy: list[Busy], rules: dict) -> list[Block]:
    tz = ZoneInfo(rules["timezone"])
    weekday = WEEKDAYS[day.weekday()]
    if weekday in rules.get("off_weekdays", []):
        return []

    override = (rules.get("overrides") or {}).get(day) or (rules.get("overrides") or {}).get(day.isoformat()) or {}
    intervals = [
        (b.start.astimezone(tz), b.end.astimezone(tz))
        for b in busy
        if b.start.astimezone(tz).date() == day
    ]
    blocks: list[Block] = []

    meals = rules["meals"]
    for kind, spec in (("lunch", meals["lunch"].get("default")), ("dinner", meals["dinner"].get(weekday))):
        spec = override.get(kind, spec)
        if not spec:
            continue
        slot = _place_meal(day, spec, meals[kind].get("search_minutes", 120), intervals, tz)
        if slot:
            blocks.append(Block(kind, *slot))
            intervals.append(slot)

    w = rules["work"]
    step = dt.timedelta(minutes=w["max_minutes"])
    gap_break = dt.timedelta(minutes=w["break_minutes"])
    min_len = dt.timedelta(minutes=w["min_minutes"])
    for gs, ge in _free_gaps(_at(day, w["start"], tz), _at(day, w["end"], tz), intervals):
        s = gs
        while ge - s >= min_len:
            e = min(s + step, ge)
            blocks.append(Block("work", s, e))
            s = e + gap_break

    si = rules["self_improvement"]
    for gs, ge in _free_gaps(_at(day, si["start"], tz), _at(day, si["end"], tz), intervals):
        if ge - gs >= dt.timedelta(minutes=si["min_minutes"]):
            blocks.append(Block("self", gs, ge))

    return sorted(blocks, key=lambda b: b.start)


def generate(busy: list[Busy], rules: dict, start: dt.date, end: dt.date) -> list[Block]:
    """Blocks for every date in [start, end], keyed by position (see assign_keys)."""
    out, day = [], start
    while day <= end:
        out += generate_day(day, busy, rules)
        day += dt.timedelta(days=1)
    return assign_keys(out, [])


def assign_keys(new: list[Block], existing: list[Block]) -> list[Block]:
    """Give each new block a key `YYYY-MM-DD:kind:n`.

    A new block inherits the key of the existing block (same date and kind) it overlaps
    most, so tasks placed in a block stay with it when a class or event shifts it.
    Unmatched blocks get the next unused ordinal for that date and kind.
    """
    used, result = set(), []
    by_slot: dict[tuple, list[Block]] = {}
    for b in existing:
        by_slot.setdefault((b.date, b.kind), []).append(b)
    next_n: dict[tuple, int] = {
        slot: max(int(b.key.rsplit(":", 1)[1]) for b in bs) for slot, bs in by_slot.items()
    }

    for b in sorted(new, key=lambda b: b.start):
        slot = (b.date, b.kind)
        best, best_overlap = None, dt.timedelta(0)
        for old in by_slot.get(slot, []):
            overlap = min(b.end, old.end) - max(b.start, old.start)
            if old.key not in used and overlap > best_overlap:
                best, best_overlap = old, overlap
        if best:
            key = best.key
        else:
            next_n[slot] = next_n.get(slot, 0) + 1
            key = f"{b.date.isoformat()}:{b.kind}:{next_n[slot]}"
        used.add(key)
        result.append(replace(b, key=key))
    return result


def weekly_summary(blocks: list[Block]) -> list[tuple[dt.date, dict[str, float]]]:
    """Hours per kind for each Monday-starting week."""
    weeks: dict[dt.date, dict[str, float]] = {}
    for b in blocks:
        monday = b.date - dt.timedelta(days=b.date.weekday())
        weeks.setdefault(monday, {}).setdefault(b.kind, 0.0)
        weeks[monday][b.kind] += b.minutes / 60
    return sorted(weeks.items())
