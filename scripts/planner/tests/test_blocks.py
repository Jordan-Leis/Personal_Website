import datetime as dt
from zoneinfo import ZoneInfo

import pytest

from scripts.planner.blocks import Block, Busy, assign_keys, generate, generate_day, load_rules

TZ = ZoneInfo("America/Toronto")
RULES = load_rules()


def at(day, hhmm):
    h, m = map(int, hhmm.split(":"))
    return dt.datetime.combine(day, dt.time(h, m), tzinfo=TZ)


def cls(day, start, end, title="Course", source="portal"):
    return Busy(at(day, start), at(day, end), title, source)


def spans(blocks, kind=None):
    return [(b.kind, b.start.strftime("%H:%M"), b.end.strftime("%H:%M")) for b in blocks if kind in (None, b.kind)]


MON = dt.date(2026, 10, 19)
TUE_MIDTERM = dt.date(2026, 10, 27)
WED = dt.date(2026, 10, 21)
THU = dt.date(2026, 10, 22)
SAT = dt.date(2026, 10, 24)
LAB_WED = dt.date(2026, 11, 4)

MONDAY_CLASSES = [cls(MON, "10:00", "11:20"), cls(MON, "14:30", "15:20"), cls(MON, "15:30", "16:50"), cls(MON, "17:30", "18:50")]


def test_typical_monday_layout():
    blocks = generate_day(MON, MONDAY_CLASSES, RULES)
    assert spans(blocks) == [
        ("work", "09:30", "10:00"),
        ("work", "11:20", "12:00"),
        ("lunch", "12:00", "12:45"),
        ("work", "12:45", "14:30"),
        ("work", "16:50", "17:30"),
        ("dinner", "19:00", "19:45"),
        ("work", "19:45", "21:00"),
        ("self", "21:00", "23:00"),
    ]
    assert sum(b.minutes for b in blocks if b.kind == "work") == 4 * 60 + 50


def test_long_gap_split_into_two_hour_blocks_with_breaks_and_short_tail_dropped():
    sunday = dt.date(2026, 10, 25)
    work = spans(generate_day(sunday, [], RULES), "work")
    assert work == [
        ("work", "09:30", "11:30"),
        ("work", "12:45", "14:45"),
        ("work", "15:00", "17:00"),
        ("work", "17:15", "18:00"),
        ("work", "18:45", "20:45"),
    ]


def test_saturday_is_empty():
    assert generate_day(SAT, [cls(SAT, "10:00", "11:00")], RULES) == []


def test_wednesday_dinner_in_short_gap():
    wed = [cls(WED, "13:00", "14:20"), cls(WED, "15:30", "16:50"), cls(WED, "17:30", "18:50"),
           cls(WED, "19:00", "19:50"), cls(WED, "20:00", "20:50")]
    assert spans(generate_day(WED, wed, RULES), "dinner") == [("dinner", "16:50", "17:30")]


def test_thursday_dinner_moves_for_extra_lecture():
    thu = [cls(THU, "17:30", "18:50"), cls(THU, "20:00", "20:50")]
    assert spans(generate_day(THU, thu, RULES), "dinner") == [("dinner", "19:00", "19:45")]


def test_midterm_day_lunch_override_after_exams():
    tue = [cls(TUE_MIDTERM, "11:45", "13:00"), cls(TUE_MIDTERM, "13:00", "14:20"), cls(TUE_MIDTERM, "17:30", "18:20")]
    blocks = generate_day(TUE_MIDTERM, tue, RULES)
    assert spans(blocks, "lunch") == [("lunch", "14:20", "15:05")]
    assert ("work", "09:30", "11:30") in spans(blocks, "work")


def test_lab_morning_left_to_lab():
    blocks = generate_day(LAB_WED, [cls(LAB_WED, "08:30", "11:20")], RULES)
    assert min(b.start for b in blocks) == at(LAB_WED, "11:20")


def test_reading_week_classes_are_busy_until_an_ignore_is_approved():
    from scripts.planner.mirror import busy_id
    from scripts.planner.overrides import effective_busy, new_suggestions

    day = dt.date(2026, 10, 14)
    lecture, personal = cls(day, "13:00", "14:20"), cls(day, "15:00", "16:00", source="google")
    # Suggested, not applied: the lecture still blocks time.
    suggestions = new_suggestions([lecture, personal], RULES, set())
    assert [s["event_key"] for s in suggestions] == [busy_id(lecture)]
    assert suggestions[0]["status"] == "suggested" and suggestions[0]["reason"] == "reading week"
    work = spans(generate_day(day, [lecture, personal], RULES), "work")
    assert not any(s < "14:20" and e > "13:00" for _, s, e in work)
    # Once approved, it frees up.
    approved = {busy_id(lecture): "reading week"}
    work = spans(generate_day(day, effective_busy([lecture, personal], approved), RULES), "work")
    assert ("work", "12:45", "14:45") in work
    assert not any(s < "16:00" and e > "15:00" for _, s, e in work)


def test_known_overrides_are_not_resuggested():
    from scripts.planner.mirror import busy_id
    from scripts.planner.overrides import new_suggestions

    lecture = cls(dt.date(2026, 10, 14), "13:00", "14:20")
    assert new_suggestions([lecture], RULES, {busy_id(lecture)}) == []
    assert new_suggestions([cls(dt.date(2026, 10, 21), "13:00", "14:20")], RULES, set()) == []


def test_dst_fall_back_week_keeps_local_times():
    before, after = dt.date(2026, 10, 30), dt.date(2026, 11, 2)
    for day in (before, after):
        blocks = generate_day(day, [cls(day, "10:00", "11:20")], RULES)
        assert spans(blocks, "work")[0] == ("work", "09:30", "10:00")
        assert all(b.start.utcoffset() == b.end.utcoffset() for b in blocks)
    assert at(before, "10:00").utcoffset() != at(after, "10:00").utcoffset()


def test_invariants_over_whole_term():
    rules_start, rules_end = RULES["term"]["start"], RULES["term"]["end"]
    blocks = generate([], RULES, rules_start, rules_end)
    by_day = {}
    for b in blocks:
        by_day.setdefault(b.date, []).append(b)
        assert at(b.date, "09:30") <= b.start < b.end <= at(b.date, "23:00")
        assert b.date.weekday() != 5
        if b.kind == "work":
            assert 30 <= b.minutes <= 120
    for day_blocks in by_day.values():
        day_blocks.sort(key=lambda b: b.start)
        for a, b in zip(day_blocks, day_blocks[1:]):
            assert a.end <= b.start, f"overlap {a} {b}"
    assert len({b.key for b in blocks}) == len(blocks)


def test_keys_stable_when_midterm_appears():
    before = generate([*MONDAY_CLASSES], RULES, MON, MON)
    keyed = {b.start.strftime("%H:%M"): b.key for b in before if b.kind == "work"}
    # A new event lands in the morning work block's spot.
    after_raw = generate_day(MON, [*MONDAY_CLASSES, cls(MON, "09:30", "10:00", "Midterm")], RULES)
    after = assign_keys(after_raw, before)
    after_keys = {b.start.strftime("%H:%M"): b.key for b in after if b.kind == "work"}
    assert "09:30" not in after_keys
    for start in ("11:20", "12:45", "16:50", "19:45"):
        assert after_keys[start] == keyed[start]


def test_new_block_gets_fresh_ordinal_not_reused_key():
    old = [Block("work", at(MON, "09:30"), at(MON, "10:00"), f"{MON}:work:1")]
    new = [Block("work", at(MON, "13:00"), at(MON, "14:00"))]
    assert assign_keys(new, old)[0].key == f"{MON}:work:2"
