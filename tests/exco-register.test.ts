import test from "node:test";
import assert from "node:assert/strict";
import {
  refKey, meetingDateLabel, meetingLabel, citation, nextResolutionRef, carriedIn,
} from "@/lib/exco-register";

test("a reference ignores case and surrounding space, as the index does", () => {
  assert.equal(refKey("  EXCO 2026/11 "), refKey("exco 2026/11"));
  assert.notEqual(refKey("EXCO 2026/11"), refKey("EXCO 2026/12"));
});

test("a missing reference keys to the empty string rather than throwing", () => {
  assert.equal(refKey(null), "");
  assert.equal(refKey(undefined), "");
});

test("a date-only value is read in local time, not shifted a day by UTC", () => {
  // A bare 2026-11-12 parsed as UTC midnight is 12 Nov in Kuala Lumpur, but
  // the same trick on a negative offset reads as the 11th. Pinning the time
  // to local midnight is what keeps a meeting on the day it was held.
  assert.equal(meetingDateLabel("2026-11-12"), "12 Nov 2026");
});

test("a date nobody can parse says nothing rather than Invalid Date", () => {
  assert.equal(meetingDateLabel("not a date"), "");
  assert.equal(meetingDateLabel(""), "");
  assert.equal(meetingDateLabel(null), "");
});

test("a meeting is named by its reference and when it sat", () => {
  assert.equal(
    meetingLabel({ ref: "EXCO 2026/11", meeting_date: "2026-11-12" }),
    "EXCO 2026/11 · 12 Nov 2026",
  );
});

test("a meeting with an unreadable date still shows its reference", () => {
  assert.equal(meetingLabel({ ref: "EXCO 2026/11", meeting_date: "" }), "EXCO 2026/11");
});

test("a citation carries the resolution and the date of the meeting", () => {
  assert.equal(
    citation({ meeting_date: "2026-11-12" }, { ref: "EXCO 2026/11-03" }),
    "EXCO 2026/11-03 · 12 Nov 2026",
  );
});

test("nothing cited renders as nothing, not as a stray separator", () => {
  assert.equal(citation({ meeting_date: "2026-11-12" }, null), "");
  assert.equal(citation(null, { ref: "EXCO 2026/11-03" }), "EXCO 2026/11-03");
});

test("the first resolution of a meeting is numbered 01", () => {
  assert.equal(nextResolutionRef("EXCO 2026/11", []), "EXCO 2026/11-01");
});

test("numbering follows the highest already there, not the count", () => {
  // Three resolutions numbered 1, 2 and 7 — a count would suggest 4 and
  // collide with nothing, but would put item 4 after item 7 in the minutes.
  assert.equal(
    nextResolutionRef("EXCO 2026/11", ["EXCO 2026/11-01", "EXCO 2026/11-02", "EXCO 2026/11-07"]),
    "EXCO 2026/11-08",
  );
});

test("a number written any other way still counts", () => {
  assert.equal(nextResolutionRef("2026/11", ["2026/11 item 4"]), "2026/11-05");
});

test("references with no number in them do not break the suggestion", () => {
  assert.equal(nextResolutionRef("EXCO 2026/11", ["opening prayer"]), "EXCO 2026/11-01");
});

test("double digits are not padded back down", () => {
  assert.equal(nextResolutionRef("EXCO 2026/11", ["EXCO 2026/11-11"]), "EXCO 2026/11-12");
});

test("a row carried in from a citation is marked as such", () => {
  assert.equal(carriedIn({ recorded_by: "backfill" }), true);
  assert.equal(carriedIn({ recorded_by: "treasurer@lcm.org.my" }), false);
  assert.equal(carriedIn({ recorded_by: null }), false);
});
