"""Deterministic email -> calendar detection. No network, no LLM.

Stages, first match wins:
  1. ics       a text/calendar part or .ics attachment (exact data)
  2. template  a known confirmation format with explicit date and time
  3. review    interview/meeting wording plus dates or a booking link -> "Needs your pick"
Anything else is ignored. Only stages 1 and 2 ever create events.
"""
from __future__ import annotations

import datetime as dt
import html
import re
from dataclasses import dataclass, field
from zoneinfo import ZoneInfo

import icalendar

HOME_TZ = ZoneInfo("America/Toronto")


@dataclass
class Email:
    message_id: str
    sender: str
    subject: str
    text: str
    received: dt.datetime
    calendars: list[bytes] = field(default_factory=list)  # raw text/calendar payloads
    bulk: bool = False  # List-Unsubscribe / Precedence: bulk


@dataclass
class Proposed:
    title: str
    start: dt.datetime
    end: dt.datetime
    location: str = ""
    uid: str | None = None
    rrule: str | None = None


@dataclass
class Decision:
    stage: str  # ics | template | review | ignored
    events: list[Proposed] = field(default_factory=list)
    cancel_uids: list[str] = field(default_factory=list)
    candidates: list[tuple[dt.datetime, dt.datetime | None]] = field(default_factory=list)
    template: str = ""


# ---------- text helpers ----------
def html_to_text(raw: str) -> str:
    raw = re.sub(r"(?is)<(script|style).*?</\1>", " ", raw)
    raw = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", raw)
    return html.unescape(re.sub(r"<[^>]+>", " ", raw))


FWD_MARKER = re.compile(r"-{3,}\s*(forwarded message|original message)\s*-{3,}", re.I)
FWD_HEADER = re.compile(r"^\s*\*?(from|date|sent|to|cc|subject)\*?\s*:", re.I)


def strip_quoted(text: str) -> str:
    """Drop quoted replies and forwarded-message headers so their dates aren't re-detected."""
    text = re.split(r"\n\s*On [\s\S]{5,200}?wrote:\s*\n", text, maxsplit=1)[0]
    out, in_header = [], False
    for line in text.splitlines():
        if FWD_MARKER.search(line):
            in_header = True
            continue
        if in_header:
            if FWD_HEADER.match(line):
                continue
            in_header = False
        if not line.lstrip().startswith(">"):
            out.append(line)
    return "\n".join(out)


def clean_subject(subject: str) -> str:
    s = re.sub(r"^\s*((re|fwd?|fw|reminder|confirmed|booked|invitation|updated invitation)\s*:\s*)+", "", subject, flags=re.I)
    s = re.sub(r"\s*@\s*\w{3} \w{3} \d.*$", "", s)  # Google invite subjects: "... @ Thu Oct 1, 2026 1:30pm - 2pm (EDT) (me)"
    return s.strip() or "Event"


MEETING_LINK = re.compile(r"https?://(?:[\w-]+\.)?(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com)/\S+", re.I)


def meeting_link(text: str) -> str:
    m = MEETING_LINK.search(text)
    return m.group(0).rstrip(").,>]") if m else ""


# ---------- dates and times ----------
MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
DATE_RE = re.compile(
    r"\b(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?"
    r"(?P<mon>jan|feb|mar|apr|may|jun|jul|aug|sept?|oct|nov|dec)[a-z]*\.?\s+(?P<day>\d{1,2})(?:st|nd|rd|th)?\b"
    r"(?:,?\s+(?P<year>20\d\d))?",
    re.I,
)
T = r"\b(?P<{n}h>\d{{1,2}})(?::(?P<{n}m>\d{{2}}))?\s*(?:(?P<{n}ap>[ap])\.?\s?m\b\.?)?"
RANGE_RE = re.compile(T.format(n="s") + r"(?:\s*\(?[ECMP][SD]?T\)?)?\s*(?:-|–|—|to|until)\s*" + T.format(n="e"), re.I)
TIME_RE = re.compile(r"\b(?P<sh>\d{1,2})(?::(?P<sm>\d{2}))?\s*(?P<sap>[ap])\.?\s?m\b\.?", re.I)
TZ_RE = re.compile(r"\b(America/[A-Za-z_]+|[ECMP][SD]?T|UTC|GMT(?![+-])|Eastern|Central|Mountain|Pacific)\b")
TZ_NAMES = {"E": "America/Toronto", "C": "America/Chicago", "M": "America/Denver", "P": "America/Los_Angeles"}


def parse_tz(text: str) -> ZoneInfo:
    m = TZ_RE.search(text)
    if not m:
        return HOME_TZ
    t = m.group(1)
    if t.startswith("America/"):
        try:
            return ZoneInfo(t)
        except Exception:
            return HOME_TZ
    if t in ("UTC", "GMT"):
        return ZoneInfo("UTC")
    return ZoneInfo(TZ_NAMES[t[0].upper()])


def _date(m: re.Match, ref: dt.date) -> dt.date | None:
    mon, day = MONTHS[m.group("mon").lower()[:3]], int(m.group("day"))
    year = int(m.group("year")) if m.group("year") else ref.year
    try:
        d = dt.date(year, mon, day)
    except ValueError:
        return None
    if not m.group("year") and d < ref - dt.timedelta(days=7):
        d = d.replace(year=year + 1)
    return d


def _hm(h: str, mnt: str | None, ap: str | None) -> tuple[int, int] | None:
    hour, minute = int(h), int(mnt or 0)
    if minute > 59 or hour > 23 or (ap and not 1 <= hour <= 12):
        return None
    if ap:
        hour = hour % 12 + (12 if ap.lower() == "p" else 0)
    return hour, minute


def parse_times(text: str) -> tuple[tuple[int, int], tuple[int, int] | None] | None:
    """First explicit time (or range) in text. A bare number without am/pm or a colon range is not a time."""
    r = RANGE_RE.search(text)
    if r and (r.group("sap") or r.group("eap")):
        eap = r.group("eap") or r.group("sap")
        sap = r.group("sap") or eap
        start, end = _hm(r.group("sh"), r.group("sm"), sap), _hm(r.group("eh"), r.group("em"), eap)
        if start and end:
            if end <= start and not r.group("sap"):  # "11:30-12:30 PM": the start is AM
                start = _hm(r.group("sh"), r.group("sm"), "a") or start
            return start, end
    t = TIME_RE.search(text)
    if t:
        start = _hm(t.group("sh"), t.group("sm"), t.group("sap"))
        return (start, None) if start else None
    return None


def _combine(d: dt.date, hm: tuple[int, int], tz: ZoneInfo) -> dt.datetime:
    return dt.datetime.combine(d, dt.time(*hm), tzinfo=tz)


def find_datetimes(text: str, ref: dt.datetime) -> list[tuple[dt.datetime, dt.datetime | None]]:
    """Every (start, end?) where a date has an explicit time next to it."""
    out = []
    for m in DATE_RE.finditer(text):
        d = _date(m, ref.date())
        if not d:
            continue
        after = text[m.end(): m.end() + 90]
        before = text[max(0, m.start() - 45): m.start()]
        window = after if parse_times(after) else before
        times = parse_times(window)
        if not times:
            continue
        tz = parse_tz(after + " " + before)
        start = _combine(d, times[0], tz)
        end = _combine(d, times[1], tz) if times[1] else None
        if end and end <= start:
            end = None
        if (start, end) not in out:
            out.append((start, end))
    return out


# ---------- stage 1: calendar invites ----------
def parse_calendars(payloads: list[bytes]) -> tuple[list[Proposed], list[str]]:
    events, cancels = [], []
    for raw in payloads:
        try:
            cal = icalendar.Calendar.from_ical(raw)
        except Exception:
            continue
        method = str(cal.get("METHOD", "PUBLISH")).upper()
        for ve in cal.walk("VEVENT"):
            uid = str(ve.get("UID", "")) or None
            if method == "CANCEL" or str(ve.get("STATUS", "")).upper() == "CANCELLED":
                if uid:
                    cancels.append(uid)
                continue
            start = ve.get("DTSTART") and ve["DTSTART"].dt
            if not isinstance(start, dt.datetime):
                continue  # all-day invites are left to Gmail
            if start.tzinfo is None:
                start = start.replace(tzinfo=HOME_TZ)
            if "DTEND" in ve:
                end = ve["DTEND"].dt
                end = end if end.tzinfo else end.replace(tzinfo=HOME_TZ)
            elif "DURATION" in ve:
                end = start + ve["DURATION"].dt
            else:
                end = start + dt.timedelta(hours=1)
            rrule = ve.get("RRULE")
            if uid and any(x.uid == uid for x in events):
                continue  # same invite inline and as an attachment
            events.append(Proposed(
                title=str(ve.get("SUMMARY", "Event")), start=start, end=end,
                location=str(ve.get("LOCATION", "")), uid=uid,
                rrule=("RRULE:" + rrule.to_ical().decode()) if rrule else None,
            ))
    return events, cancels


# ---------- stage 2: known confirmation formats ----------
CONFIRM = re.compile(r"(you(?:'|’)?re|you are) (?:confirmed|booked|scheduled)|(?:is|has been) (?:confirmed|scheduled)|confirmation|it(?:'|’)s confirmed", re.I)


def tpl_ashby(e: Email) -> list[Proposed]:
    """Ashby 'Your Upcoming Interview' / confirmation: an Agenda with dated, timed items."""
    if "ashbyhq.com" not in e.sender.lower() or not re.search(r"upcoming interview|interview (?:is )?(?:confirmed|scheduled)", e.text, re.I):
        return []
    agenda = e.text.split("Agenda:", 1)[-1] if "Agenda:" in e.text else ""
    dm = DATE_RE.search(agenda)
    if not dm or not (d := _date(dm, e.received.date())):
        return []
    company = re.search(r"interview with (.+?) for the", e.text, re.I)
    events = []
    for line in agenda[dm.end():].splitlines():
        line = line.strip(" -•*\t")
        if DATE_RE.match(line):
            break  # a second day: stop rather than guess
        t = parse_times(line)
        if not t or not t[1]:
            continue
        tz = parse_tz(line)
        name = re.split(r"\)\s*-\s*", line, maxsplit=1)[-1].strip() if ")" in line else ""
        title = f"{name} · {company.group(1)}" if company and name else name or clean_subject(e.subject)
        events.append(Proposed(title, _combine(d, t[0], tz), _combine(d, t[1], tz), meeting_link(e.text)))
    return events


def tpl_date_time_fields(e: Email) -> list[Proposed]:
    """Recruiter confirmations with 'Date: …' and 'Time: …' lines (e.g. Ashby/Greenhouse-style)."""
    if not CONFIRM.search(e.subject + "\n" + e.text):
        return []
    flat = e.text.replace("*", "")
    dates = re.findall(r"(?im)^\s*date\s*:\s*(.+)$", flat)
    times = re.findall(r"(?im)^\s*time\s*:\s*(.+)$", flat)
    if len(dates) != 1 or len(times) != 1:
        return []
    dm = DATE_RE.search(dates[0])
    t = parse_times(times[0])
    if not dm or not t or not (d := _date(dm, e.received.date())):
        return []
    tz = parse_tz(times[0])
    start = _combine(d, t[0], tz)
    end = _combine(d, t[1], tz) if t[1] else start + dt.timedelta(minutes=30)
    return [Proposed(clean_subject(e.subject), start, end, meeting_link(flat))]


def tpl_doodle(e: Email) -> list[Proposed]:
    """Doodle 'Booked: <event>' with one 'Mon D, YYYY, h:mm PM - h:mm PM Zone' line."""
    if "doodle.com" not in e.sender.lower() or not e.subject.lower().startswith("booked:"):
        return []
    found = find_datetimes(e.text, e.received)
    if len(found) != 1 or not found[0][1]:
        return []
    return [Proposed(clean_subject(e.subject), found[0][0], found[0][1], meeting_link(e.text))]


TEMPLATES = [("ashby", tpl_ashby), ("doodle", tpl_doodle), ("date-time-fields", tpl_date_time_fields)]

# ---------- stage 3: needs your pick ----------
KEYWORDS = re.compile(r"\b(interview|meeting|phone (?:call|screen)|video call|coffee chat|appointment|on-?site|info(?:rmation)? session|screening)\b", re.I)
BOOKING_LINK = re.compile(r"https?://(?:calendly\.com|doodle\.com|\S*ashbyhq\.com/\S*schedul|\S*goodtime\.io|outlook\.office365\.com/book|\S*youcanbook\.me|\S*greenhouse\.io/\S*schedul)", re.I)


def decide(e: Email, now: dt.datetime) -> Decision:
    events, cancels = parse_calendars(e.calendars)
    if events or cancels:
        return Decision("ics", [x for x in events if x.end > now or x.rrule], cancels)

    body = strip_quoted(e.text)
    scoped = Email(e.message_id, e.sender, e.subject, body, e.received, [], e.bulk)
    for name, tpl in TEMPLATES:
        found = tpl(scoped)
        if found:
            return Decision("template", [x for x in found if x.end > now], template=name)

    if e.bulk or not KEYWORDS.search(e.subject + "\n" + body[:3000]):
        return Decision("ignored")
    candidates = [c for c in find_datetimes(body, e.received) if c[0] > now][:6]
    if candidates or BOOKING_LINK.search(body):
        return Decision("review", candidates=candidates)
    return Decision("ignored")
