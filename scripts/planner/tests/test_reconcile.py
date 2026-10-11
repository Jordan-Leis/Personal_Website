import datetime as dt
from zoneinfo import ZoneInfo

from scripts.planner.blocks import Block
from scripts.planner.reconcile import event_body, plan_changes

TZ = ZoneInfo("America/Toronto")
TODAY = dt.date(2026, 10, 20)


def at(day, hhmm):
    h, m = map(int, hhmm.split(":"))
    return dt.datetime.combine(day, dt.time(h, m), tzinfo=TZ)


def event(block, eid):
    body = event_body(block, "America/Toronto")
    return {"id": eid, **body}


def blk(day, s, e, kind="work", key=""):
    return Block(kind, at(day, s), at(day, e), key)


def test_first_run_creates_everything_from_today():
    yesterday, tomorrow = TODAY - dt.timedelta(days=1), TODAY + dt.timedelta(days=1)
    gen = [blk(yesterday, "09:30", "11:30"), blk(TODAY, "09:30", "11:30"), blk(tomorrow, "09:30", "11:30")]
    _, ch = plan_changes(gen, [], TODAY)
    assert [b.date for b in ch.create] == [TODAY, tomorrow]
    assert not ch.update and not ch.delete


def test_second_run_is_idempotent():
    gen = [blk(TODAY, "09:30", "11:30"), blk(TODAY, "12:00", "12:45", "lunch")]
    desired, _ = plan_changes(gen, [], TODAY)
    events = [event(b, f"e{i}") for i, b in enumerate(desired)]
    _, ch = plan_changes(gen, events, TODAY)
    assert len(ch) == 0


def test_shifted_block_is_updated_in_place_and_removed_block_deleted():
    old = [blk(TODAY, "09:30", "11:30", key=f"{TODAY}:work:1"), blk(TODAY, "14:00", "16:00", key=f"{TODAY}:work:2")]
    events = [event(b, f"e{i}") for i, b in enumerate(old)]
    gen = [blk(TODAY, "10:00", "11:30")]  # first block shortened, second gone
    _, ch = plan_changes(gen, events, TODAY)
    assert [(eid, b.key) for eid, b in ch.update] == [("e0", f"{TODAY}:work:1")]
    assert ch.delete == ["e1"] and not ch.create


def test_past_days_are_frozen():
    past = TODAY - dt.timedelta(days=2)
    events = [event(blk(past, "09:30", "11:30", key=f"{past}:work:1"), "old")]
    _, ch = plan_changes([], events, TODAY)
    assert len(ch) == 0


def test_duplicate_keys_are_cleaned_up():
    b = blk(TODAY, "09:30", "11:30", key=f"{TODAY}:work:1")
    _, ch = plan_changes([blk(TODAY, "09:30", "11:30")], [event(b, "a"), event(b, "b")], TODAY)
    assert ch.delete == ["b"] and not ch.create and not ch.update
