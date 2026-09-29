// Suggesting the next office reference, and noticing when one looks wrong.
import test from "node:test";
import assert from "node:assert/strict";
import { nextOfficeRef, checkOfficeRef, refSeries, refSequence } from "@/lib/pv/office-ref";

test("the next reference keeps the shape of the last one", () => {
  assert.equal(nextOfficeRef("PV/2026/0417"), "PV/2026/0418");
  assert.equal(nextOfficeRef("LCM-2026-004"), "LCM-2026-005");
  assert.equal(nextOfficeRef("417"), "418");
});

test("the width of the number is part of the format", () => {
  // Dropping a leading zero would break a sort somebody relies on.
  assert.equal(nextOfficeRef("009"), "010");
  assert.equal(nextOfficeRef("PV-0099"), "PV-0100");
  assert.equal(nextOfficeRef("99"), "100", "unless the number has outgrown it");
});

test("a suffix after the number is kept", () => {
  assert.equal(nextOfficeRef("2026/0417/A"), "2026/0418/A");
});

test("nothing is suggested when there is nothing to go on", () => {
  // Guessing from nothing is how a sequence gets a number nobody meant.
  assert.equal(nextOfficeRef(""), "");
  assert.equal(nextOfficeRef(null), "");
  assert.equal(nextOfficeRef("no digits here"), "");
});

test("a reference already used is worth stopping for", () => {
  const note = checkOfficeRef("PV/2026/0417", [{ ref: "PV/2026/0417", pv_no: "LCM-2026-004" }]);
  assert.equal(note.tone, "warn");
  assert.match(note.message, /LCM-2026-004/);
});

test("a skipped number is mentioned, not refused", () => {
  const note = checkOfficeRef("PV/2026/0420", [], "PV/2026/0417");
  assert.equal(note.tone, "info", "worth saying, not worth blocking");
  assert.match(note.message, /PV\/2026\/0418/);
  assert.match(note.message, /2 numbers skipped/);
});

test("going backwards is mentioned too", () => {
  const note = checkOfficeRef("PV/2026/0410", [], "PV/2026/0417");
  assert.equal(note.tone, "info");
  assert.match(note.message, /backwards/);
});

test("the expected next number passes without comment", () => {
  assert.equal(checkOfficeRef("PV/2026/0418", [], "PV/2026/0417").tone, "none");
});

test("starting a new series is allowed and unremarked", () => {
  // Finance may begin a new run whenever the books do. Comparing across two
  // series would produce a warning about a gap that does not exist.
  assert.equal(checkOfficeRef("REIMB/001", [], "PV/2026/0417").tone, "none");
  assert.equal(refSeries("PV/2026/0417"), "pv/2026/");
  assert.equal(refSequence("PV/2026/0417"), 417);
});

test("an empty reference says nothing at all", () => {
  assert.equal(checkOfficeRef("", [{ ref: "X", pv_no: "Y" }], "PV/2026/0417").tone, "none");
});
