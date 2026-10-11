import datetime as dt
from zoneinfo import ZoneInfo

from scripts.planner.blocks import Busy
from scripts.planner.mirror import busy_id
from scripts.planner.uw_classes import plan

TZ = ZoneInfo("America/Toronto")
A = Busy(dt.datetime(2026, 10, 19, 10, tzinfo=TZ), dt.datetime(2026, 10, 19, 11, 20, tzinfo=TZ), "ECE 320 (LEC)", "portal")
B = Busy(dt.datetime(2026, 10, 19, 14, 30, tzinfo=TZ), dt.datetime(2026, 10, 19, 15, 20, tzinfo=TZ), "BME 386 (TUT)", "portal")


def ev(eid, b):
    return {"id": eid, "extendedProperties": {"private": {"classKey": busy_id(b)}}}


def test_creates_missing_and_removes_gone_or_duplicate():
    create, delete = plan([A], [ev("x", B), ev("a1", A), ev("a2", A)])
    assert create == [] and set(delete) == {"x", "a2"}


def test_first_run_creates_all():
    create, delete = plan([A, B], [])
    assert create == [A, B] and delete == []
