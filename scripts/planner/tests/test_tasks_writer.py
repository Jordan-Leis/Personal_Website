import datetime as dt
from zoneinfo import ZoneInfo

from scripts.planner.reconcile import DEFAULT_DESCRIPTION
from scripts.planner.tasks_writer import describe, plan_descriptions, settle_outcomes

TZ = ZoneInfo("America/Toronto")
NOW = dt.datetime(2026, 10, 19, 15, 0, tzinfo=TZ)


def ev(eid, key, kind="work", description=DEFAULT_DESCRIPTION):
    return {"id": eid, "description": description,
            "extendedProperties": {"private": {"blockKey": key, "kind": kind}}}


def pl(pid, task, key, outcome="planned", placed="2026-10-19T09:00:00Z"):
    return {"id": pid, "task_id": task, "block_key": key, "outcome": outcome, "placed_at": placed}


TASKS = {
    "a": {"id": "a", "title": "Finish ECE 313 PS4", "status": "in_progress", "due_at": "2026-10-20T23:59:00-04:00", "due_has_time": False},
    "b": {"id": "b", "title": "Apply to 15 jobs", "status": "done", "due_at": None},
}


def test_settle_marks_done_tasks_and_ended_blocks():
    ends = {"k1": NOW - dt.timedelta(hours=1), "k2": NOW + dt.timedelta(hours=1)}
    out = settle_outcomes([pl("1", "a", "k1"), pl("2", "a", "k2"), pl("3", "b", "k2"), pl("4", "a", "gone")], TASKS, ends, NOW)
    assert {(u["id"], u["outcome"]) for u in out} == {("1", "missed"), ("3", "done")}


def test_description_lists_tasks_in_commit_order_with_icons():
    changes = plan_descriptions(
        [ev("e1", "k1")],
        [pl("2", "b", "k1", "done", "2026-10-19T10:00:00Z"), pl("1", "a", "k1", "planned", "2026-10-19T09:00:00Z")],
        TASKS, [{"task_id": "a", "done": True}, {"task_id": "a", "done": False}],
    )
    assert changes == [("e1", "Tasks:\n☐ Finish ECE 313 PS4  (1/2 subtasks, due Tue Oct 20)\n✓ Apply to 15 jobs\n\n— managed by jordanleis.com/to-do")]


def test_unchanged_moved_and_meal_blocks_are_skipped():
    events = [ev("e1", "k1"), ev("e2", "k2", kind="lunch"), ev("e3", "k3", description=describe(["✗ Apply to 15 jobs"]))]
    placements = [pl("1", "a", "k1", "moved"), pl("2", "b", "k3", "missed")]
    assert plan_descriptions(events, placements, TASKS, []) == []


def test_emptied_block_resets_to_default():
    assert plan_descriptions([ev("e1", "k1", description=describe(["☐ Old"]))], [], TASKS, []) == [("e1", DEFAULT_DESCRIPTION)]


def test_project_parts_name_their_project():
    tasks = {**TASKS,
             "p": {"id": "p", "title": "Apply to 100 Cycle 2 jobs", "status": "in_progress", "due_at": None},
             "c": {"id": "c", "title": "Apply to 10 jobs (3/10)", "status": "in_progress", "due_at": None, "parent_id": "p"}}
    changes = plan_descriptions([ev("e1", "k1")], [pl("1", "c", "k1")], tasks, [])
    assert changes[0][1].startswith("Tasks:\n☐ Apply to 10 jobs (3/10) · Apply to 100 Cycle 2 jobs")
