// Who is still "new", and for how long.
//
// The banner is cosmetic; the window is not. Getting it wrong means somebody
// is welcomed to a church office they joined two months ago, or — worse, and
// the likelier of the two — never welcomed at all because the day they started
// fell on the wrong side of a timezone.
import test from "node:test";
import assert from "node:assert/strict";
import { welcomeCutoff, isNewlyJoined, firstNameOf, WELCOME_DAYS } from "@/lib/new-joiners";

const on = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 14, 30); // mid-afternoon, local
};

test("the window is a calendar date, not an instant", () => {
  // Written out from local parts. Subtracting 30 days of milliseconds and
  // calling toISOString() would land on the 6th here for anywhere east of UTC,
  // quietly shortening the window by a day for half of every day.
  assert.equal(welcomeCutoff(on("2026-12-07")), "2026-11-07");
});

test("somebody who started today is welcomed", () => {
  assert.ok(isNewlyJoined("2026-11-06", on("2026-11-06")));
});

test("the last day of the window still counts, the next does not", () => {
  const today = on("2026-12-07");
  assert.ok(isNewlyJoined("2026-11-07", today), "day 30 should still be new");
  assert.ok(!isNewlyJoined("2026-11-06", today), "day 31 should not");
});

test("the window spans a month boundary, and a year one", () => {
  assert.equal(welcomeCutoff(on("2026-03-05")), "2026-02-03"); // back through February
  assert.equal(welcomeCutoff(on("2026-01-10")), "2025-12-11"); // back through New Year
});

test("a leap year is counted by the calendar, not by arithmetic", () => {
  // 2028 is a leap year: 30 days back from 29 March is 28 February.
  assert.equal(welcomeCutoff(on("2028-03-29")), "2028-02-28");
});

test("somebody with no joining date is not welcomed", () => {
  // The directory holds vendors and volunteers with nothing in the field. A
  // missing date is not a recent one.
  assert.ok(!isNewlyJoined(null, on("2026-11-06")));
  assert.ok(!isNewlyJoined("", on("2026-11-06")));
});

test("a timestamp in the column is read as the date it falls on", () => {
  assert.ok(isNewlyJoined("2026-11-06T00:00:00+08:00", on("2026-11-06")));
});

test("the window is the thirty days the constant says", () => {
  // So that changing the constant changes the behaviour, rather than the
  // behaviour being baked into a second place that disagrees with it.
  const today = on("2026-06-30");
  const cut = welcomeCutoff(today);
  const days = Math.round((today.getTime() - on(cut).getTime()) / 86_400_000);
  assert.equal(days, WELCOME_DAYS);
});

test("somebody is greeted by the name they go by", () => {
  assert.equal(firstNameOf({ full_name: "Rachel Lim Mei Ling", preferred_name: null }), "Rachel");
  assert.equal(firstNameOf({ full_name: "Lim Mei Ling", preferred_name: "Rachel" }), "Rachel");
  // A preferred name is often a single word already, and extra spacing in a
  // directory typed by hand should not become part of it.
  assert.equal(firstNameOf({ full_name: "  Jermaine   Aaron ", preferred_name: "" }), "Jermaine");
});
