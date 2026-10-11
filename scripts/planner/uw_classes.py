"""Keep a "UW Classes" calendar: the Portal feed minus approved ignores.

Google can't hide events in a subscribed calendar, so this filtered copy replaces the
raw "Portal Calendar" subscription in Google Calendar's view.
"""
from __future__ import annotations

import datetime as dt

from .blocks import Busy
from .mirror import busy_id

CALENDAR_NAME = "UW Classes"
COLOR = "9"  # Blueberry


def find_or_create(service, timezone: str) -> str:
    token = None
    while True:
        resp = service.calendarList().list(pageToken=token).execute()
        for cal in resp.get("items", []):
            if cal.get("summary") == CALENDAR_NAME and cal.get("accessRole") == "owner":
                return cal["id"]
        token = resp.get("nextPageToken")
        if not token:
            break
    return service.calendars().insert(body={"summary": CALENDAR_NAME, "timeZone": timezone}).execute()["id"]


def plan(classes: list[Busy], existing: list[dict]) -> tuple[list[Busy], list[str]]:
    """(classes to create, event ids to delete). Classes are immutable by key: a moved class is a new key."""
    want = {busy_id(b): b for b in classes}
    have = {}
    for e in existing:
        key = e.get("extendedProperties", {}).get("private", {}).get("classKey")
        have.setdefault(key, []).append(e["id"])
    create = [b for k, b in want.items() if k not in have]
    delete = [eid for k, ids in have.items() for i, eid in enumerate(ids) if k not in want or i > 0]
    return create, delete


def sync(service, portal: list[Busy], approved: dict[str, str], start: dt.datetime, end: dt.datetime, timezone: str) -> dict:
    cal_id = find_or_create(service, timezone)
    existing, token = [], None
    while True:
        resp = service.events().list(
            calendarId=cal_id, timeMin=start.isoformat(), timeMax=end.isoformat(), singleEvents=True,
            maxResults=2500, pageToken=token, privateExtendedProperty="planner=1",
        ).execute()
        existing += [e for e in resp.get("items", []) if e.get("status") != "cancelled"]
        token = resp.get("nextPageToken")
        if not token:
            break
    classes = [b for b in portal if busy_id(b) not in approved]
    create, delete = plan(classes, existing)
    ops = [service.events().insert(calendarId=cal_id, body={
        "summary": b.title,
        "start": {"dateTime": b.start.isoformat(), "timeZone": timezone},
        "end": {"dateTime": b.end.isoformat(), "timeZone": timezone},
        "colorId": COLOR, "reminders": {"useDefault": False, "overrides": []},
        "extendedProperties": {"private": {"planner": "1", "classKey": busy_id(b)}},
    }) for b in create] + [service.events().delete(calendarId=cal_id, eventId=eid) for eid in delete]
    for i in range(0, len(ops), 50):
        batch = service.new_batch_http_request()
        for op in ops[i:i + 50]:
            batch.add(op)
        batch.execute()
    return {"created": len(create), "deleted": len(delete)}
