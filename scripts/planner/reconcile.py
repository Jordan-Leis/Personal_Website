"""Keep the "Work Blocks" Google calendar in sync with the generated blocks."""
from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field

from .blocks import Block, assign_keys

CALENDAR_NAME = "Work Blocks"
COLORS = {"work": "6", "self": "3", "lunch": "8", "dinner": "8"}  # Tangerine, Grape, Graphite
DEFAULT_DESCRIPTION = "Tasks:\n(none yet)\n\n— managed by jordanleis.com/to-do"


@dataclass
class Changes:
    create: list[Block] = field(default_factory=list)
    update: list[tuple[str, Block]] = field(default_factory=list)  # (event id, block)
    delete: list[str] = field(default_factory=list)  # event ids

    def __len__(self):
        return len(self.create) + len(self.update) + len(self.delete)


def get_or_create_calendar(service, timezone: str) -> str:
    token = None
    while True:
        resp = service.calendarList().list(pageToken=token).execute()
        for cal in resp.get("items", []):
            if cal.get("summary") == CALENDAR_NAME and cal.get("accessRole") == "owner":
                return cal["id"]
        token = resp.get("nextPageToken")
        if not token:
            break
    created = service.calendars().insert(body={"summary": CALENDAR_NAME, "timeZone": timezone}).execute()
    return created["id"]


def list_block_events(service, calendar_id: str, start: dt.datetime, end: dt.datetime) -> list[dict]:
    events, token = [], None
    while True:
        resp = service.events().list(
            calendarId=calendar_id, timeMin=start.isoformat(), timeMax=end.isoformat(),
            singleEvents=True, maxResults=2500, pageToken=token,
            privateExtendedProperty="planner=1",
        ).execute()
        events += [e for e in resp.get("items", []) if e.get("status") != "cancelled"]
        token = resp.get("nextPageToken")
        if not token:
            return events


def event_to_block(event: dict) -> Block:
    props = event["extendedProperties"]["private"]
    return Block(
        props["kind"],
        dt.datetime.fromisoformat(event["start"]["dateTime"]),
        dt.datetime.fromisoformat(event["end"]["dateTime"]),
        props["blockKey"],
    )


def event_body(block: Block, timezone: str, description: str | None = None) -> dict:
    body = {
        "summary": block.title,
        "start": {"dateTime": block.start.isoformat(), "timeZone": timezone},
        "end": {"dateTime": block.end.isoformat(), "timeZone": timezone},
        "colorId": COLORS[block.kind],
        "transparency": "opaque",
        "reminders": {"useDefault": False, "overrides": []},
        "extendedProperties": {"private": {"planner": "1", "blockKey": block.key, "kind": block.kind}},
    }
    if description is not None:
        body["description"] = description
    return body


def plan_changes(generated: list[Block], events: list[dict], today: dt.date) -> tuple[list[Block], Changes]:
    """Diff generated blocks against existing calendar events.

    Dates before `today` are frozen: their events are never touched, and blocks
    generated for them are ignored. Returns the keyed desired blocks and the changes.
    """
    existing = {}
    for e in events:
        b = event_to_block(e)
        if b.key in existing:  # duplicate key: keep the first, delete the rest
            existing[b.key + "#dup" + e["id"]] = (e["id"], None)
            continue
        existing[b.key] = (e["id"], b)

    current = [b for _, b in existing.values() if b and b.date >= today]
    desired = assign_keys([b for b in generated if b.date >= today], current)

    changes = Changes()
    desired_keys = set()
    for b in desired:
        desired_keys.add(b.key)
        if b.key not in existing:
            changes.create.append(b)
            continue
        event_id, old = existing[b.key]
        if (old.start, old.end, old.kind) != (b.start, b.end, b.kind):
            changes.update.append((event_id, b))
    for key, (event_id, old) in existing.items():
        if old is None or (old.date >= today and key not in desired_keys):
            changes.delete.append(event_id)
    return desired, changes


def apply_changes(service, calendar_id: str, changes: Changes, timezone: str) -> None:
    ops = (
        [service.events().insert(calendarId=calendar_id, body=event_body(b, timezone, DEFAULT_DESCRIPTION)) for b in changes.create]
        + [service.events().patch(calendarId=calendar_id, eventId=eid, body=event_body(b, timezone)) for eid, b in changes.update]
        + [service.events().delete(calendarId=calendar_id, eventId=eid) for eid in changes.delete]
    )
    errors = []

    def callback(_id, _resp, exc):
        if exc is not None:
            errors.append(exc)

    for i in range(0, len(ops), 50):
        batch = service.new_batch_http_request(callback=callback)
        for op in ops[i:i + 50]:
            batch.add(op)
        batch.execute()
    if errors:
        raise RuntimeError(f"{len(errors)} of {len(ops)} calendar writes failed; first: {errors[0]}")
