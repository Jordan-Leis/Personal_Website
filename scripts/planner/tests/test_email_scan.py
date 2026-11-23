import datetime as dt
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from googleapiclient.errors import HttpError

from scripts.planner import email_scan as es
from scripts.planner.email_parse import Email, Proposed

TZ = ZoneInfo("America/Toronto")
NOW = dt.datetime(2026, 11, 23, 12, 0, tzinfo=TZ)


def http_error(status):
    return HttpError(SimpleNamespace(status=status, reason="x"), b"{}")


# ---------- error keys (public logs: class + status only) ----------
def test_error_key_includes_http_status():
    assert es.error_key(http_error(500)) == "HttpError500"


def test_error_key_plain_exception():
    assert es.error_key(KeyError("subject")) == "KeyError"


def test_is_gone():
    assert es.is_gone(http_error(404)) and es.is_gone(http_error(410))
    assert not es.is_gone(http_error(500)) and not es.is_gone(ValueError())


# ---------- retry list ----------
def test_failed_ids_are_kept_with_attempt_counts():
    retry, dropped = es.next_retry({}, {"a", "b"})
    assert retry == {"a": 1, "b": 1} and dropped == 0


def test_ids_that_succeed_leave_the_retry_list():
    retry, _ = es.next_retry({"a": 1, "b": 2}, {"b"})
    assert retry == {"b": 3}


def test_ids_are_dropped_after_three_attempts():
    retry, dropped = es.next_retry({"a": 3}, {"a"})
    assert retry == {} and dropped == 1


# ---------- fallback rescan window ----------
def test_fallback_covers_time_since_last_sync():
    assert es.fallback_days((NOW - dt.timedelta(days=15)).isoformat(), NOW) == 16


def test_fallback_minimum_three_days():
    assert es.fallback_days((NOW - dt.timedelta(hours=2)).isoformat(), NOW) == 3


def test_fallback_capped_at_thirty_days():
    assert es.fallback_days((NOW - dt.timedelta(days=90)).isoformat(), NOW) == 30


def test_fallback_without_last_sync():
    assert es.fallback_days(None, NOW) == 14
    assert es.fallback_days("not a date", NOW) == 14


# ---------- updated invitations ----------
def body_for(ev):
    return es.event_body(ev, Email("m1", "a@b.c", "s", "", NOW))


def existing(ev, **over):
    b = body_for(ev)
    e = {"id": "e1", "summary": b["summary"], "start": {"dateTime": ev.start.isoformat()},
         "end": {"dateTime": ev.end.isoformat()}, "location": b["location"],
         "extendedProperties": {"private": {"plannerSource": es.SOURCE}}}
    e.update(over)
    return e


EV = Proposed("Callbacks", dt.datetime(2026, 12, 3, 18, 0, tzinfo=TZ), dt.datetime(2026, 12, 3, 19, 30, tzinfo=TZ),
              "https://zoom.us/j/new", uid="uid-1")


def test_patch_for_unchanged_event_is_empty():
    assert es.patch_for(existing(EV), body_for(EV)) == {}


def test_patch_for_changed_location():
    old = existing(EV, location="https://zoom.us/j/old")
    assert es.patch_for(old, body_for(EV)) == {"location": "https://zoom.us/j/new"}


def test_patch_for_moved_time_compares_instants():
    old = existing(EV, start={"dateTime": "2026-12-03T22:00:00Z"}, end={"dateTime": "2026-12-04T00:30:00Z"})
    p = es.patch_for(old, body_for(EV))
    assert set(p) == {"start"}  # end 00:30Z == 19:30 EST, unchanged


def test_patch_for_recurrence_change():
    ev = Proposed(EV.title, EV.start, EV.end, EV.location, EV.uid, "RRULE:FREQ=WEEKLY")
    assert es.patch_for(existing(EV), body_for(ev)) == {"recurrence": ["RRULE:FREQ=WEEKLY"]}


class FakeCal:
    """Just enough of the Calendar API for upsert_event."""

    def __init__(self, items):
        self.items, self.calls = items, []

    def events(self):
        return self

    def list(self, **kw):
        self.calls.append(("list", kw))
        items = self.items if "iCalUID" in kw else []
        return SimpleNamespace(execute=lambda **_: {"items": items})

    def patch(self, **kw):
        self.calls.append(("patch", kw))
        return SimpleNamespace(execute=lambda **_: {"id": kw["eventId"]})

    def import_(self, **kw):
        self.calls.append(("import", kw))
        return SimpleNamespace(execute=lambda **_: {"id": "new"})

    def insert(self, **kw):
        self.calls.append(("insert", kw))
        return SimpleNamespace(execute=lambda **_: {"id": "new"})


EMAIL = Email("m1", "a@b.c", "s", "", NOW)


def test_upsert_patches_our_event_when_invite_changes():
    cal = FakeCal([existing(EV, location="https://zoom.us/j/old")])
    assert es.upsert_event(cal, EV, EMAIL) == ("e1", "updated")
    patch = [kw for op, kw in cal.calls if op == "patch"][0]
    assert patch["body"] == {"location": "https://zoom.us/j/new"}


def test_upsert_leaves_unchanged_event_alone():
    cal = FakeCal([existing(EV)])
    assert es.upsert_event(cal, EV, EMAIL) == (None, None)
    assert not [c for c in cal.calls if c[0] == "patch"]


def test_upsert_never_touches_events_it_did_not_create():
    cal = FakeCal([existing(EV, location="old", extendedProperties={})])
    assert es.upsert_event(cal, EV, EMAIL) == (None, None)
    assert not [c for c in cal.calls if c[0] == "patch"]


def test_upsert_skips_cancelled_copies():
    cal = FakeCal([existing(EV, location="old", status="cancelled")])
    assert es.upsert_event(cal, EV, EMAIL) == ("new", "created")


def test_upsert_creates_new_invite():
    cal = FakeCal([])
    assert es.upsert_event(cal, EV, EMAIL) == ("new", "created")
    assert [c[0] for c in cal.calls][-1] == "import"
