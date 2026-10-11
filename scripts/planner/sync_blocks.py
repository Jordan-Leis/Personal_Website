"""Generate blocks for the rest of the term and reconcile them into Google Calendar.

    python -m scripts.planner.sync_blocks            # dry run: summary only
    python -m scripts.planner.sync_blocks --days     # dry run with a per-day listing (local use only)
    python -m scripts.planner.sync_blocks --apply    # write to the "Work Blocks" calendar

Output contains counts and times only (never event titles), so it is safe in public CI logs,
except --days, which is meant for local runs.
"""
import argparse
import datetime as dt
from zoneinfo import ZoneInfo

from . import reconcile, tasks_writer
from .mirror import mirror
from .blocks import generate, load_rules, weekly_summary
from .config import load_env
from .gcal import calendar_service
from .sources import fetch_ics, google_busy
from .supa import Supabase


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--days", action="store_true")
    parser.add_argument("--today", type=dt.date.fromisoformat, help="pretend today is this date")
    args = parser.parse_args(argv)

    env, rules = load_env(), load_rules()
    tz = ZoneInfo(rules["timezone"])
    today = args.today or dt.datetime.now(tz).date()
    first, last = max(today, rules["term"]["start"]), rules["term"]["end"]
    window = (dt.datetime.combine(first, dt.time(0), tz), dt.datetime.combine(last + dt.timedelta(days=1), dt.time(0), tz))

    busy = fetch_ics(env["PORTAL_ICS_URL"], "portal", *window, tz)
    counts = {"portal": len(busy)}
    if env.get("OUTLOOK_ICS_URL"):
        outlook = fetch_ics(env["OUTLOOK_ICS_URL"], "outlook", *window, tz)
        busy += outlook
        counts["outlook"] = len(outlook)
    service = calendar_service(env)
    if service:
        primary = google_busy(service, "primary", *window)
        busy += primary
        counts["google"] = len(primary)
    print("busy events:", counts, "" if service else "(no Google token yet: primary calendar skipped)")

    blocks = generate(busy, rules, first, last)
    for monday, hours in weekly_summary(blocks):
        print(f"week of {monday}: " + "  ".join(f"{k} {hours.get(k, 0):.1f}h" for k in ("work", "self", "lunch", "dinner")))
    if args.days:
        for day in sorted({b.date for b in blocks}):
            row = [f"{b.kind[0].upper()} {b.start:%H:%M}-{b.end:%H:%M}" for b in blocks if b.date == day]
            print(f"  {day:%a %m-%d}: " + " | ".join(row))

    if not service:
        return
    if args.apply:
        cal_id = reconcile.get_or_create_calendar(service, rules["timezone"])
    else:
        cal_id = reconcile.find_calendar(service)
    events = reconcile.list_block_events(service, cal_id, *window) if cal_id else []
    _, changes = reconcile.plan_changes(blocks, events, today)
    print(f"changes: create {len(changes.create)}, update {len(changes.update)}, delete {len(changes.delete)}"
          + ("" if args.apply else " (dry run)"))
    if not args.apply:
        return
    if changes:
        reconcile.apply_changes(service, cal_id, changes, rules["timezone"])
        print("applied")

    if env.get("SUPABASE_URL") and env.get("SUPABASE_SERVICE_KEY"):
        term = (dt.datetime.combine(rules["term"]["start"], dt.time(0), tz), window[1])
        all_blocks = reconcile.list_block_events(service, cal_id, *term)
        db = Supabase(env["SUPABASE_URL"], env["SUPABASE_SERVICE_KEY"])
        print("mirrored:", mirror(db, all_blocks, busy, rules, window[0], window[1]))
        print("tasks:", tasks_writer.run(db, service, cal_id, all_blocks, dt.datetime.now(tz)))


if __name__ == "__main__":
    main()
