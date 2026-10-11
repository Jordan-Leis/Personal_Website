"""Scan new Gmail messages and put confirmed interviews and meetings on the primary calendar.

Read-only on Gmail. Events it creates are titled "[Auto] …" and tagged with
extendedProperties.private.plannerSource = "email-auto", so it only ever cancels its own.
Output is counts only (Actions logs are public).
"""
from __future__ import annotations

import base64
import datetime as dt
import time
from zoneinfo import ZoneInfo

from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from .email_parse import Decision, Email, Proposed, clean_subject, decide, html_to_text
from .gcal import credentials
from .supa import Supabase

TZ = "America/Toronto"
SOURCE = "email-auto"
SKIP_LABELS = {"SENT", "DRAFT", "SPAM", "TRASH", "CHAT", "CATEGORY_PROMOTIONS", "CATEGORY_SOCIAL", "CATEGORY_FORUMS"}
FILTER = "-in:sent -in:chats -category:promotions -category:social -category:forums"
OWN_ADDRESSES = ("jordan.jay.leis@gmail.com",)


def gmail_service(env):
    creds = credentials(env)
    return build("gmail", "v1", credentials=creds, cache_discovery=False) if creds else None


# ---------- fetching ----------
def _list(gmail, query: str, cap: int = 300) -> list[str]:
    ids, token = [], None
    while len(ids) < cap:
        resp = gmail.users().messages().list(userId="me", q=query, maxResults=100, pageToken=token).execute(num_retries=5)
        ids += [m["id"] for m in resp.get("messages", [])]
        token = resp.get("nextPageToken")
        if not token:
            break
    return ids[:cap]


def new_message_ids(gmail, db: Supabase) -> tuple[list[str], str]:
    """Message ids added since the last run, and the history id to resume from next time."""
    resume = gmail.users().getProfile(userId="me").execute(num_retries=5)["historyId"]
    state = db.select("sync_state", {"select": "value", "key": "eq.gmail_history_id"})
    if not state:
        return _list(gmail, f"newer_than:14d {FILTER}"), resume
    ids, token = [], None
    try:
        while True:
            resp = gmail.users().history().list(
                userId="me", startHistoryId=state[0]["value"], historyTypes=["messageAdded"], pageToken=token,
            ).execute(num_retries=5)
            for h in resp.get("history", []):
                ids += [a["message"]["id"] for a in h.get("messagesAdded", [])]
            token = resp.get("nextPageToken")
            if not token:
                break
    except HttpError as err:
        if err.resp.status != 404:
            raise
        ids = _list(gmail, f"newer_than:3d {FILTER}")  # history expired: rescan recent mail
    return list(dict.fromkeys(ids)), resume


def _b64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def load_message(gmail, message_id: str) -> Email | None:
    msg = gmail.users().messages().get(userId="me", id=message_id, format="full").execute(num_retries=5)
    if SKIP_LABELS & set(msg.get("labelIds", [])):
        return None
    headers = {h["name"].lower(): h["value"] for h in msg["payload"].get("headers", [])}
    sender = headers.get("from", "")
    if any(a in sender.lower() for a in OWN_ADDRESSES):
        return None
    plain, html_parts, calendars = [], [], []

    def walk(part):
        mime = part.get("mimeType", "").lower()
        name = (part.get("filename") or "").lower()
        body = part.get("body", {})
        if mime in ("text/calendar", "application/ics") or name.endswith(".ics"):
            data = body.get("data")
            if not data and body.get("attachmentId"):
                data = gmail.users().messages().attachments().get(
                    userId="me", messageId=message_id, id=body["attachmentId"]).execute(num_retries=5)["data"]
            if data:
                calendars.append(_b64(data))
        elif mime == "text/plain" and body.get("data") and not name:
            plain.append(_b64(body["data"]).decode("utf-8", "replace"))
        elif mime == "text/html" and body.get("data") and not name:
            html_parts.append(_b64(body["data"]).decode("utf-8", "replace"))
        for p in part.get("parts", []):
            walk(p)

    walk(msg["payload"])
    text = "\n".join(plain) or html_to_text("\n".join(html_parts))
    received = dt.datetime.fromtimestamp(int(msg["internalDate"]) / 1000, tz=ZoneInfo(TZ))
    bulk = "list-unsubscribe" in headers or headers.get("precedence", "").lower() in ("bulk", "list")
    return Email(message_id, sender, headers.get("subject", ""), text, received, calendars, bulk)


# ---------- calendar writes ----------
def _same_start_exists(cal, start: dt.datetime, end: dt.datetime) -> bool:
    resp = cal.events().list(
        calendarId="primary", timeMin=(start - dt.timedelta(minutes=1)).isoformat(),
        timeMax=(end + dt.timedelta(minutes=1)).isoformat(), singleEvents=True,
    ).execute(num_retries=5)
    for e in resp.get("items", []):
        s = e.get("start", {}).get("dateTime")
        if e.get("status") != "cancelled" and s and dt.datetime.fromisoformat(s) == start:
            return True
    return False


def _uid_exists(cal, uid: str) -> bool:
    return bool(cal.events().list(calendarId="primary", iCalUID=uid, showDeleted=False).execute(num_retries=5).get("items"))


def create_event(cal, ev: Proposed, email: Email) -> str | None:
    """Create an [Auto] event unless the calendar already has it. Returns the new event id."""
    if (ev.uid and _uid_exists(cal, ev.uid)) or _same_start_exists(cal, ev.start, ev.end):
        return None
    tz = ZoneInfo(TZ)
    body = {
        "summary": f"[Auto] {ev.title}",
        "start": {"dateTime": ev.start.astimezone(tz).isoformat(), "timeZone": TZ},
        "end": {"dateTime": ev.end.astimezone(tz).isoformat(), "timeZone": TZ},
        "location": ev.location,
        "description": "\n".join([
            "Added automatically from email by jordanleis.com/to-do.",
            f"From: {email.sender}",
            f"Subject: {email.subject}",
            f"https://mail.google.com/mail/u/0/#all/{email.message_id}",
        ]),
        "extendedProperties": {"private": {"plannerSource": SOURCE, "gmailId": email.message_id}},
    }
    if ev.rrule:
        body["recurrence"] = [ev.rrule]
    if ev.uid:
        body["iCalUID"] = ev.uid
        return cal.events().import_(calendarId="primary", body=body).execute(num_retries=5)["id"]
    return cal.events().insert(calendarId="primary", body=body).execute(num_retries=5)["id"]


def cancel_events(cal, uid: str) -> int:
    n = 0
    for e in cal.events().list(calendarId="primary", iCalUID=uid).execute(num_retries=5).get("items", []):
        if e.get("extendedProperties", {}).get("private", {}).get("plannerSource") == SOURCE and e.get("status") != "cancelled":
            cal.events().delete(calendarId="primary", eventId=e["id"]).execute(num_retries=5)
            n += 1
    return n


# ---------- orchestration ----------
def _record(db: Supabase, email: Email, d: Decision, event_id: str | None) -> None:
    db.upsert("email_scans", [{"gmail_message_id": email.message_id, "stage": d.stage, "gcal_event_id": event_id}], "gmail_message_id")
    if d.stage == "review":
        db.upsert("review_items", [{
            "gmail_message_id": email.message_id, "subject": email.subject[:300], "sender": email.sender[:300],
            "received_at": email.received.isoformat(),
            "candidates": [{"start": s.isoformat(), "end": e.isoformat() if e else None} for s, e in d.candidates],
        }], "gmail_message_id")


def add_accepted_reviews(db: Supabase, cal) -> int:
    """Times picked on /schedule become events."""
    added = 0
    for r in db.select("review_items", {"select": "*", "status": "eq.accepted"}):
        start = dt.datetime.fromisoformat(r["chosen_start"])
        end = dt.datetime.fromisoformat(r["chosen_end"]) if r.get("chosen_end") else start + dt.timedelta(hours=1)
        email = Email(r["gmail_message_id"], r["sender"], r["subject"], "", start)
        create_event(cal, Proposed(clean_subject(r["subject"]), start, end), email)
        db.update("review_items", {"id": f"eq.{r['id']}"}, {"status": "added"})
        added += 1
    return added


def run(env: dict, db: Supabase, cal, now: dt.datetime) -> dict:
    gmail = gmail_service(env)
    counts = {"messages": 0, "ics": 0, "template": 0, "review": 0, "created": 0, "cancelled": 0, "errors": 0}
    ids, resume = new_message_ids(gmail, db)
    seen = set()
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        quoted = ",".join(f'"{x}"' for x in chunk)
        seen |= {r["gmail_message_id"] for r in db.select("email_scans", {"select": "gmail_message_id", "gmail_message_id": f"in.({quoted})"})}
    for mid in ids:
        if mid in seen:
            continue
        try:
            time.sleep(0.1)  # stay well under Gmail's per-minute quota on big first runs
            email = load_message(gmail, mid)
            if email is None:
                continue
            counts["messages"] += 1
            d = decide(email, now)
            first_id = None
            for ev in d.events:
                eid = create_event(cal, ev, email)
                if eid:
                    counts["created"] += 1
                    first_id = first_id or eid
            for uid in d.cancel_uids:
                counts["cancelled"] += cancel_events(cal, uid)
            if d.stage in counts:
                counts[d.stage] += 1
            _record(db, email, d, first_id)
        except Exception:
            counts["errors"] += 1  # retried next run; no details logged (public logs)
    if not counts["errors"]:
        db.upsert("sync_state", [{"key": "gmail_history_id", "value": resume}], "key")
    counts["picked"] = add_accepted_reviews(db, cal)
    return counts
