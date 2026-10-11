"""Busy-time sources: ICS feeds (UW Portal, Outlook) and Google Calendar."""
from __future__ import annotations

import datetime as dt
from zoneinfo import ZoneInfo

import icalendar
import recurring_ical_events
import requests

from .blocks import Busy


def _is_free_ics(event) -> bool:
    return (
        str(event.get("STATUS", "")).upper() == "CANCELLED"
        or str(event.get("TRANSP", "")).upper() == "TRANSPARENT"
        or str(event.get("X-MICROSOFT-CDO-BUSYSTATUS", "")).upper() == "FREE"
    )


def parse_ics(data: bytes, source: str, start: dt.datetime, end: dt.datetime, tz: ZoneInfo) -> list[Busy]:
    cal = icalendar.Calendar.from_ical(data)
    busy = []
    for event in recurring_ical_events.of(cal).between(start, end):
        s = event["DTSTART"].dt
        if not isinstance(s, dt.datetime) or _is_free_ics(event):
            continue  # all-day or free/cancelled
        if "DTEND" in event:
            e = event["DTEND"].dt
        else:
            e = s + event["DURATION"].dt
        busy.append(Busy(s.astimezone(tz), e.astimezone(tz), str(event.get("SUMMARY", "")), source))
    return busy


def fetch_ics(url: str, source: str, start: dt.datetime, end: dt.datetime, tz: ZoneInfo) -> list[Busy]:
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return parse_ics(resp.content, source, start, end, tz)


def _is_free_google(event: dict) -> bool:
    if event.get("status") == "cancelled" or event.get("transparency") == "transparent":
        return True
    if "dateTime" not in event.get("start", {}):
        return True  # all-day
    return any(a.get("self") and a.get("responseStatus") == "declined" for a in event.get("attendees", []))


def google_busy(service, calendar_id: str, start: dt.datetime, end: dt.datetime, source: str = "google") -> list[Busy]:
    busy, token = [], None
    while True:
        resp = service.events().list(
            calendarId=calendar_id, timeMin=start.isoformat(), timeMax=end.isoformat(),
            singleEvents=True, orderBy="startTime", maxResults=2500, pageToken=token,
        ).execute()
        for event in resp.get("items", []):
            if _is_free_google(event):
                continue
            busy.append(Busy(
                dt.datetime.fromisoformat(event["start"]["dateTime"]),
                dt.datetime.fromisoformat(event["end"]["dateTime"]),
                event.get("summary", ""), source,
            ))
        token = resp.get("nextPageToken")
        if not token:
            return busy
