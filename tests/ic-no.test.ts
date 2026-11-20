// Reading a date of birth out of a MyKad number.
//
// Invented numbers, except the shape. A wrong date of birth moves EPF at 60,
// SOCSO at 60, EIS and the age EPF closes altogether, so the parser refuses
// far more readily than it guesses.
import test from "node:test";
import assert from "node:assert/strict";
import { dobFromIc, digitsOf } from "@/lib/ic-no";

const NOW = new Date("2026-11-20T00:00:00Z");

test("the first six digits are the birth date", () => {
  assert.equal(dobFromIc("730103145013", NOW), "1973-01-03");
});

test("dashes make no difference — people type them or they do not", () => {
  assert.equal(dobFromIc("730103-14-5013", NOW), "1973-01-03");
  assert.equal(dobFromIc(" 730103 14 5013 ", NOW), "1973-01-03");
  assert.equal(digitsOf("730103-14-5013"), "730103145013");
});

test("a two-digit year that would land in the future belongs to the century before", () => {
  // 73 → 2073 is not a birth date anybody has yet, so it is 1973.
  assert.equal(dobFromIc("730103145013", NOW), "1973-01-03");
  // 19 → 2019 is in the past, so it stands. A nine-year-old is not on payroll,
  // but the rule has to be the same rule either way.
  assert.equal(dobFromIc("190103145013", NOW), "2019-01-03");
});

test("the century turns on the day, not the year", () => {
  // Born earlier in the current year: today's century, not a hundred back.
  assert.equal(dobFromIc("260101145013", NOW), "2026-01-01");
  // Later this year, so it cannot be this year.
  assert.equal(dobFromIc("261231145013", NOW), "1926-12-31");
});

test("a half-typed number is refused rather than guessed at", () => {
  // Filling the box from six digits would put a wrong date in front of
  // somebody at exactly the moment they are inclined to accept it.
  assert.equal(dobFromIc("7301", NOW), null);
  assert.equal(dobFromIc("730103", NOW), null);
  assert.equal(dobFromIc("73010314501", NOW), null);
  assert.equal(dobFromIc("7301031450134", NOW), null, "and one digit too many");
  assert.equal(dobFromIc("", NOW), null);
});

test("a date that is not a date is refused", () => {
  assert.equal(dobFromIc("731301145013", NOW), null, "month 13");
  assert.equal(dobFromIc("730001145013", NOW), null, "month 0");
  assert.equal(dobFromIc("730132145013", NOW), null, "day 32");
  assert.equal(dobFromIc("730100145013", NOW), null, "day 0");
  assert.equal(dobFromIc("730231145013", NOW), null, "31 February rolls over, so it never was one");
});

test("29 February is kept in a leap year and refused outside one", () => {
  assert.equal(dobFromIc("000229145013", NOW), "2000-02-29");
  assert.equal(dobFromIc("010229145013", NOW), null);
});

test("letters are not digits", () => {
  assert.equal(dobFromIc("73010314501X", NOW), null, "eleven digits once the letter is dropped");
});
