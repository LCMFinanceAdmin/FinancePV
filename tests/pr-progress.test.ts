// Where a payment request has got to.
//
// This is the only question the tracker exists to answer, and it is answered
// from two tables: the request until a voucher exists, the voucher after. The
// failure that matters is a chain that stops at "PV raised" and lets somebody
// believe they have been paid when the voucher has not been signed yet.
import test from "node:test";
import assert from "node:assert/strict";
import {
  STAGES, DONE, OFF_CHAIN, currentStage, statusLabel, bucketOf,
} from "@/lib/pr-progress";

test("the chain runs past Finance, to the signatories and out to payment", () => {
  assert.deepEqual([...STAGES], [
    "Submitted", "Ministry EXCO", "General Manager", "Finance / PV", "Signatories", "Paid",
  ]);
});

test("the stage shown is the one holding it, not the last one cleared", () => {
  // Verified by the EXCO means it is with the GM, not still with the EXCO.
  assert.equal(currentStage("EXCO_VERIFIED"), 2);
  assert.equal(STAGES[currentStage("EXCO_VERIFIED")], "General Manager");
  assert.equal(STAGES[currentStage("SUBMITTED")], "Ministry EXCO");
  assert.equal(STAGES[currentStage("GM_APPROVED")], "Finance / PV");
});

test("a raised voucher still being worked on is Finance's desk", () => {
  // The claimant cannot act on the difference between these, and would not
  // recognise the names, so they are one stage.
  for (const pv of ["PENDING", "FINANCE_REVIEW", "GM_REVIEW", "REVIEWED", "PENDING_CHECK"] as const) {
    assert.equal(STAGES[currentStage("PV_RAISED", pv)], "Finance / PV", pv);
  }
});

test("a voucher with the signatories says so", () => {
  assert.equal(STAGES[currentStage("PV_RAISED", "PENDING_SIGNATORY")], "Signatories");
  assert.equal(statusLabel("PV_RAISED", "PENDING_SIGNATORY"), "With the signatories");
});

test("signed but not yet paid is not the same as paid", () => {
  // The distinction the old chain could not make at all: APPROVED means every
  // signatory has signed and the money has still not moved.
  assert.equal(STAGES[currentStage("PV_RAISED", "APPROVED")], "Paid");
  assert.equal(statusLabel("PV_RAISED", "APPROVED"), "Awaiting payment");
  assert.notEqual(currentStage("PV_RAISED", "APPROVED"), DONE);
});

test("paid is the end of the chain and nobody is holding it", () => {
  assert.equal(currentStage("PV_RAISED", "PAID"), DONE);
  assert.equal(statusLabel("PV_RAISED", "PAID"), "Paid");
});

test("a request with no voucher yet does not claim one", () => {
  // PV_RAISED with the voucher not loaded must not read as paid.
  assert.equal(STAGES[currentStage("PV_RAISED", null)], "Finance / PV");
  assert.equal(statusLabel("PV_RAISED", null), "PV raised");
});

test("refused or withdrawn leaves the chain rather than sitting on a stage", () => {
  assert.equal(currentStage("REJECTED"), OFF_CHAIN);
  assert.equal(currentStage("CANCELLED"), OFF_CHAIN);
  // And a voucher refused after the request was approved.
  assert.equal(currentStage("PV_RAISED", "REJECTED"), OFF_CHAIN);
  assert.equal(statusLabel("PV_RAISED", "REJECTED"), "Voucher rejected");
});

test("every stage on the chain is a real one", () => {
  const states: [string, string | null][] = [
    ["SUBMITTED", null], ["EXCO_VERIFIED", null], ["GM_APPROVED", null],
    ["PV_RAISED", "PENDING"], ["PV_RAISED", "PENDING_SIGNATORY"],
    ["PV_RAISED", "APPROVED"], ["PV_RAISED", "PAID"],
  ];
  for (const [pr, pv] of states) {
    const cur = currentStage(pr as never, pv as never);
    assert.ok(cur === DONE || (cur >= 0 && cur < STAGES.length), `${pr}/${pv} -> ${cur}`);
  }
});

test("the chain only ever moves forwards", () => {
  const order = [
    currentStage("SUBMITTED"), currentStage("EXCO_VERIFIED"), currentStage("GM_APPROVED"),
    currentStage("PV_RAISED", "PENDING"), currentStage("PV_RAISED", "PENDING_SIGNATORY"),
    currentStage("PV_RAISED", "APPROVED"), currentStage("PV_RAISED", "PAID"),
  ];
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] >= order[i - 1], `step ${i} went backwards: ${order}`);
  }
});

test("Completed means paid, not raised", () => {
  // Somebody filtering to Completed is asking what they no longer have to
  // chase. A raised voucher is still something to chase.
  assert.equal(bucketOf("PV_RAISED", "PAID"), "done");
  assert.equal(bucketOf("PV_RAISED", "PENDING_SIGNATORY"), "approved");
  assert.equal(bucketOf("PV_RAISED", "APPROVED"), "approved");
  assert.equal(bucketOf("GM_APPROVED"), "approved");
  assert.equal(bucketOf("SUBMITTED"), "progress");
  assert.equal(bucketOf("EXCO_VERIFIED"), "progress");
});

test("anything refused lands on the closed shelf, whichever record refused it", () => {
  assert.equal(bucketOf("REJECTED"), "closed");
  assert.equal(bucketOf("CANCELLED"), "closed");
  assert.equal(bucketOf("PV_RAISED", "REJECTED"), "closed");
  assert.equal(bucketOf("PV_RAISED", "CANCELLED"), "closed");
});
