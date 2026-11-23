import datetime as dt
from zoneinfo import ZoneInfo

from scripts.planner.blocks import Block, block_window
from scripts.planner.reconcile import event_body, plan_changes

TZ = ZoneInfo("America/Toronto")
D = dt.date


def rules(**term):
    return {"term": {"start": D(2026, 10, 12), **term}}


def test_horizon_without_end_rolls_forward():
    assert block_window(rules(horizon_days=45), D(2026, 11, 23)) == (D(2026, 11, 23), D(2027, 1, 7))


def test_end_caps_the_horizon():
    assert block_window(rules(horizon_days=45, end=D(2026, 12, 18)), D(2026, 11, 23)) == (D(2026, 11, 23), D(2026, 12, 18))


def test_horizon_shorter_than_end():
    assert block_window(rules(horizon_days=7, end=D(2026, 12, 18)), D(2026, 11, 23)) == (D(2026, 11, 23), D(2026, 11, 30))


def test_never_before_start():
    # The horizon counts from the first block day, not from today.
    assert block_window(rules(horizon_days=10), D(2026, 10, 1)) == (D(2026, 10, 12), D(2026, 10, 22))


def test_last_day_is_included():
    assert block_window(rules(horizon_days=45, end=D(2026, 12, 18)), D(2026, 12, 18)) == (D(2026, 12, 18), D(2026, 12, 18))


def test_past_end_is_none():
    assert block_window(rules(horizon_days=45, end=D(2026, 12, 18)), D(2026, 12, 19)) is None


def test_old_rules_without_horizon_still_work():
    assert block_window(rules(end=D(2026, 11, 30)), D(2026, 11, 23)) == (D(2026, 11, 23), D(2026, 11, 30))


def test_iso_string_dates_are_accepted():
    r = {"term": {"start": "2026-10-12", "end": "2026-12-18", "horizon_days": 45}}
    assert block_window(r, D(2026, 11, 23)) == (D(2026, 11, 23), D(2026, 12, 18))


def _ev(day, eid):
    s = dt.datetime.combine(day, dt.time(9, 30), tzinfo=TZ)
    b = Block("work", s, s + dt.timedelta(hours=2), f"{day.isoformat()}:work:1")
    return {"id": eid, **event_body(b, "America/Toronto")}


def test_shrunken_window_never_deletes_past_blocks():
    today = D(2026, 12, 18)
    past = [_ev(D(2026, 12, 10), "old1"), _ev(D(2026, 12, 17), "old2")]
    _, ch = plan_changes([], past, today)
    assert ch.delete == []
