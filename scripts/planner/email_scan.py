"""Scan new Gmail messages and put confirmed interviews and meetings on the primary calendar.

Read-only on Gmail. Events it creates are titled "[Auto] …" and tagged with
extendedProperties.private.plannerSource = "email-auto", so it only ever updates or cancels
its own. An updated invitation (same UID) patches the existing [Auto] event.
Output is counts and error class names only (Actions logs are public).
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
RETRY_KEY = "gmail_retry_ids"
MAX_ATTEMPTS = 3  # a message that keeps failing is retried on this many later runs, then dropped


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


def fallback_days(last_sync: str | None, now: dt.datetime) -> int:
    """How far back to rescan when the stored history id has expired: since the last sync, 3-30 days."""
    try:
        since = dt.datetime.fromisoformat(last_sync)
    except (TypeError, ValueError):
        return 14
    return min(30, max(3, (now - since).days + 1))


def _state(db: Supabase) -> dict:
    return {r["key"]: r["value"] for r in db.select("sync_state", {"select": "key,value"})}


def new_message_ids(gmail, state: dict, now: dt.datetime) -> tuple[list[str], str]:
    """Message ids added since the last run, and the history id to resume from next time."""
    resume = gmail.users().getProfile(userId="me").execute(num_retries=5)["historyId"]
    if "gmail_history_id" not in state:
        return _list(gmail, f"newer_than:14d {FILTER}"), resume
    ids, token = [], None
    try:
        while True:
            resp = gmail.users().history().list(
                userId="me", startHistoryId=state["gmail_history_id"], historyTypes=["messageAdded"], pageToken=token,
            ).execute(num_retries=5)
            for h in resp.get("history", []):
                ids += [a["message"]["id"] for a in h.get("messagesAdded", [])]
            token = resp.get("nextPageToken")
            if not token:
                break
    except HttpError as err:
        if err.resp.status != 404:
            raise
        # History expired (e.g. the job didn't run for a while): rescan everything since the last sync.
        ids = _list(gmail, f"newer_than:{fallback_days(state.get('last_sync'), now)}d {FILTER}", cap=1000)
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


def _by_uid(cal, uid: str) -> list[dict]:
    items = cal.events().list(calendarId="primary", iCalUID=uid, showDeleted=False).execute(num_retries=5).get("items", [])
    return [e for e in items if e.get("status") != "cancelled"]


def _ours(event: dict) -> bool:
    return event.get("extendedProperties", {}).get("private", {}).get("plannerSource") == SOURCE


def event_body(ev: Proposed, email: Email) -> dict:
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
    return body


def patch_for(existing: dict, body: dict) -> dict:
    """The fields of an [Auto] event that an updated invitation changes (description is left alone)."""
    patch = {}
    if existing.get("summary") != body["summary"]:
        patch["summary"] = body["summary"]
    for k in ("start", "end"):
        old = existing.get(k, {}).get("dateTime")
        if not old or dt.datetime.fromisoformat(old) != dt.datetime.fromisoformat(body[k]["dateTime"]):
            patch[k] = body[k]
    if (existing.get("location") or "") != (body.get("location") or ""):
        patch["location"] = body.get("location") or ""
    if (existing.get("recurrence") or []) != (body.get("recurrence") or []):
        patch["recurrence"] = body.get("recurrence") or []
    return patch


def upsert_event(cal, ev: Proposed, email: Email) -> tuple[str | None, str | None]:
    """Create an [Auto] event, or patch ours when an invite with the same UID changed.

    Returns (event id, "created" | "updated"), or (None, None) when there is nothing to do:
    the calendar already has it unchanged, or the UID belongs to an event we didn't create.
    """
    body = event_body(ev, email)
    if ev.uid:
        live = _by_uid(cal, ev.uid)
        if live:
            mine = [e for e in live if _ours(e)]
            patch = patch_for(mine[0], body) if mine else {}
            if not patch:
                return None, None
            cal.events().patch(calendarId="primary", eventId=mine[0]["id"], body=patch).execute(num_retries=5)
            return mine[0]["id"], "updated"
    if _same_start_exists(cal, ev.start, ev.end):
        return None, None
    if ev.uid:
        body["iCalUID"] = ev.uid
        return cal.events().import_(calendarId="primary", body=body).execute(num_retries=5)["id"], "created"
    return cal.events().insert(calendarId="primary", body=body).execute(num_retries=5)["id"], "created"


def cancel_events(cal, uid: str) -> int:
    n = 0
    for e in cal.events().list(calendarId="primary", iCalUID=uid).execute(num_retries=5).get("items", []):
        if _ours(e) and e.get("status") != "cancelled":
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
        upsert_event(cal, Proposed(clean_subject(r["subject"]), start, end), email)
        db.update("review_items", {"id": f"eq.{r['id']}"}, {"status": "added"})
        added += 1
    return added


def is_gone(err: Exception) -> bool:
    """The message was deleted after it was listed (drafts, trashed mail): skip it, don't retry."""
    return isinstance(err, HttpError) and err.resp.status in (404, 410)


def error_key(err: Exception) -> str:
    """Class name plus HTTP status: enough to diagnose, nothing private (logs are public)."""
    return type(err).__name__ + (str(err.resp.status) if isinstance(err, HttpError) else "")


def next_retry(previous: dict[str, int], failed: set[str]) -> tuple[dict[str, int], int]:
    """({message id: attempts} to retry next run, number given up on)."""
    attempts = {mid: previous.get(mid, 0) + 1 for mid in failed}
    keep = {mid: n for mid, n in attempts.items() if n <= MAX_ATTEMPTS}
    return keep, len(attempts) - len(keep)


def run(env: dict, db: Supabase, cal, now: dt.datetime, rescan_days: int | None = None) -> dict:
    gmail = gmail_service(env)
    counts = {"messages": 0, "ics": 0, "template": 0, "review": 0, "created": 0, "updated": 0,
              "cancelled": 0, "gone": 0, "errors": 0}
    errors_by: dict[str, int] = {}
    state = _state(db)
    ids, resume = new_message_ids(gmail, state, now)
    retry_prev = state.get(RETRY_KEY) or {}
    if rescan_days:
        ids += _list(gmail, f"newer_than:{rescan_days}d {FILTER}", cap=2000)
    ids = list(dict.fromkeys(ids + list(retry_prev)))
    seen = set()
    for i in range(0, len(ids), 100):
        chunk = ids[i:i + 100]
        quoted = ",".join(f'"{x}"' for x in chunk)
        seen |= {r["gmail_message_id"] for r in db.select("email_scans", {"select": "gmail_message_id", "gmail_message_id": f"in.({quoted})"})}
    failed: set[str] = set()
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
                eid, action = upsert_event(cal, ev, email)
                if action:
                    counts[action] += 1
                    first_id = first_id or eid
            for uid in d.cancel_uids:
                counts["cancelled"] += cancel_events(cal, uid)
            if d.stage in counts:
                counts[d.stage] += 1
            _record(db, email, d, first_id)
        except Exception as err:
            if is_gone(err):
                counts["gone"] += 1
                continue
            failed.add(mid)
            errors_by[error_key(err)] = errors_by.get(error_key(err), 0) + 1
    # Always move on: failures are retried from the list below instead of holding the cursor back.
    retry, dropped = next_retry(retry_prev, failed)
    db.upsert("sync_state", [{"key": "gmail_history_id", "value": resume}, {"key": RETRY_KEY, "value": retry}], "key")
    counts.update(errors=len(failed), retrying=len(retry), dropped=dropped)
    if errors_by:
        counts["errors_by"] = errors_by
    counts["picked"] = add_accepted_reviews(db, cal)
    return counts
