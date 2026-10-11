"""Fixtures are synthetic (invented companies/links) but mirror real formats."""
import datetime as dt
from zoneinfo import ZoneInfo

from scripts.planner.email_parse import Email, decide, find_datetimes, parse_times, strip_quoted

TZ = ZoneInfo("America/Toronto")
NOW = dt.datetime(2026, 10, 12, 9, 0, tzinfo=TZ)
RECEIVED = dt.datetime(2026, 10, 11, 20, 0, tzinfo=TZ)


def mail(text, subject="Hello", sender="someone@example.com", calendars=(), bulk=False):
    return Email("m1", sender, subject, text, RECEIVED, list(calendars), bulk)


def at(d, hh, mm=0, tz=TZ):
    return dt.datetime(2026, 10, d, hh, mm, tzinfo=tz)


ICS = b"""BEGIN:VCALENDAR
METHOD:REQUEST
BEGIN:VEVENT
UID:abc123@google.com
SUMMARY:Interview with Acme Robotics
DTSTART:20261022T180000Z
DTEND:20261022T183000Z
LOCATION:https://meet.google.com/aaa-bbbb-ccc
END:VEVENT
END:VCALENDAR
"""


def test_calendar_invite_is_parsed_exactly():
    d = decide(mail("You have been invited", calendars=[ICS]), NOW)
    assert d.stage == "ics"
    (ev,) = d.events
    assert (ev.title, ev.uid, ev.start, ev.end) == ("Interview with Acme Robotics", "abc123@google.com", at(22, 14), at(22, 14, 30))
    assert ev.location.startswith("https://meet.google.com/")


def test_calendar_cancel_returns_uid():
    d = decide(mail("cancelled", calendars=[ICS.replace(b"METHOD:REQUEST", b"METHOD:CANCEL")]), NOW)
    assert d.stage == "ics" and d.cancel_uids == ["abc123@google.com"] and not d.events


def test_past_invite_creates_nothing():
    old = ICS.replace(b"20261022", b"20261001")
    assert decide(mail("x", calendars=[old]), NOW).events == []


def test_date_time_fields_confirmation():
    text = """Hi Jordan,

Thanks for submitting your availability. You're confirmed for your interview. Please see the details below.

Intern First Round Interview
*Date*: Thu, Oct 22, 2026
*Time*: 1:30 PM EDT - 2:00 PM EDT
*Meeting Link*:
https://meet.google.com/xyz-abcd-efg
"""
    d = decide(mail(text, "Acme Robotics Interview Confirmation - Hardware Intern", "recruiter@acme.example"), NOW)
    assert d.stage == "template" and d.template == "date-time-fields"
    (ev,) = d.events
    assert (ev.start, ev.end) == (at(22, 13, 30), at(22, 14))
    assert ev.title == "Acme Robotics Interview Confirmation - Hardware Intern"
    assert ev.location == "https://meet.google.com/xyz-abcd-efg"


def test_ashby_agenda():
    text = """Jordan Leis,

You have an upcoming interview with Acme Robotics for the Hardware Engineering Intern job! Here are the details.

Location:

https://meet.google.com/xyz-abcd-efg

Agenda:

Thursday, October 22, 2026

 - 1:30 PM - 2:00 PM (EDT) - Intern First Round Interview

   - Pat Example (Hardware Engineer)"""
    d = decide(mail(text, "Reminder: Your Upcoming Interview with Acme Robotics", "no-reply@ashbyhq.com"), NOW)
    assert d.stage == "template" and d.template == "ashby"
    (ev,) = d.events
    assert ev.title == "Intern First Round Interview · Acme Robotics"
    assert (ev.start, ev.end) == (at(22, 13, 30), at(22, 14))


def test_doodle_booking():
    text = """You're booked for Fellowship Interview B! Hi Jordan, It's confirmed, you booked a time.
| Oct 23, 2026, 8:00 PM - 8:30 PM America/Toronto (GMT-04:00) |
To reschedule click here"""
    d = decide(mail(text, "Booked: Fellowship Interview B", "mailer@doodle.com"), NOW)
    assert d.stage == "template" and d.template == "doodle"
    assert (d.events[0].start, d.events[0].end, d.events[0].title) == (at(23, 20), at(23, 20, 30), "Fellowship Interview B")


def test_offer_of_several_times_goes_to_review_not_calendar():
    text = """Hi Jordan, we'd love to schedule your interview. Do any of these work?
- Thursday, October 22 at 2:00 PM ET
- Friday, October 23 at 10:00 AM ET
- Saturday, October 24 at 1:00 PM ET"""
    d = decide(mail(text, "Interview scheduling", "talent@shop.example"), NOW)
    assert d.stage == "review" and not d.events
    assert [c[0] for c in d.candidates] == [at(22, 14), at(23, 10), at(24, 13)]


def test_booking_link_without_times_goes_to_review():
    text = "Thanks for applying! Please book your phone screen here: https://calendly.com/acme/30min"
    d = decide(mail(text, "Next steps", "jobs@acme.example"), NOW)
    assert d.stage == "review" and d.candidates == [] and not d.events


def test_confirmation_language_without_explicit_time_is_not_auto_added():
    text = "Your interview is confirmed for next week. We'll send details soon."
    d = decide(mail(text, "Interview confirmed", "jobs@acme.example"), NOW)
    assert d.stage == "ignored" and not d.events


def test_newsletters_and_unrelated_mail_are_ignored():
    assert decide(mail("Top 10 interview tips for Oct 22 at 2pm webinar", "Ace your interview", bulk=True), NOW).stage == "ignored"
    assert decide(mail("Your package ships Oct 22 by 8pm"), NOW).stage == "ignored"


def test_quoted_reply_dates_are_ignored():
    text = """Thanks, see you then!

On Mon, Oct 12, 2026 at 11:04 PM Pat Example <
pat@acme.example> wrote:

> Interview: Thursday, October 22 at 2:00 PM ET"""
    assert "October 22" not in strip_quoted(text)
    assert decide(mail(text, "Re: Interview", "pat@acme.example"), NOW).stage == "ignored"


def test_time_parsing_edge_cases():
    assert parse_times("11:30-12:30 PM") == ((11, 30), (12, 30))
    assert parse_times("2-3pm") == ((14, 0), (15, 0))
    assert parse_times("Room 2026 - floor 3") is None
    assert parse_times("at 9am") == ((9, 0), None)


def test_year_rolls_forward_and_timezones_convert():
    received = dt.datetime(2026, 12, 20, 10, tzinfo=TZ)
    (start, end), = find_datetimes("Interview Jan 5 at 11:00 AM PT", received)
    assert start == dt.datetime(2027, 1, 5, 11, tzinfo=ZoneInfo("America/Los_Angeles")) and end is None


def test_forwarded_header_date_is_not_an_appointment():
    text = """FYI see below
---------- Forwarded message ---------
From: Office <office@example.org>
Date: Tue, Oct 13, 2026 at 3:53 PM
Subject: Your phone appointment
To: <me@example.com>

Please call us to book your phone appointment."""
    d = decide(mail(text, "Fwd: Phone Appointment"), NOW)
    assert d.stage == "ignored" and d.candidates == []


def test_same_invite_inline_and_attached_counts_once():
    d = decide(mail("invite", calendars=[ICS, ICS]), NOW)
    assert len(d.events) == 1


def test_flattened_confirmation_still_matches():
    text = "You're confirmed for your interview. Please see the details below. Date:\r\nThu, Oct 22, 2026 Time: 3:00 PM EDT - 3:30 PM EDT Meeting Link:\r\nhttps://meet.google.com/abc-defg-hij\r\n"
    d = decide(mail(text, "Interview Confirmation - Test Company"), NOW)
    assert d.stage == "template"
    assert (d.events[0].start, d.events[0].end) == (at(22, 15), at(22, 15, 30))


def test_two_dates_in_a_confirmation_is_not_auto_added():
    text = "You're confirmed. Date: Thu, Oct 22, 2026 Time: 3:00 PM ET. Backup date: Fri, Oct 23, 2026"
    assert decide(mail(text, "Interview Confirmation"), NOW).stage != "template"
