// What a signing officer is shown, and what is not theirs yet.
//
// The Bishop, the Treasurer and the Secretary sign; they do not run the desk
// that prepares what they sign. Their list was showing every voucher in the
// building — nine of them, one of which was theirs — so the question these
// answer is "has this reached them", asked of the approval trail rather than
// of a status that can lag behind it.
import test from "node:test";
import assert from "node:assert/strict";
import { reachedSignatories, computedBadgeStatus } from "@/lib/utils";

const FIN = { role: "FINANCE_ADMIN", action: "APPROVED" };
const GM  = { role: "GENERAL_MANAGER", action: "APPROVED" };
const EXCO = { role: "MINISTRY_HEAD", action: "APPROVED" };

test("a voucher still with the EXCO has not reached them", () => {
  assert.equal(reachedSignatories({ status: "PENDING_HEAD", approvals: [] }), false);
});

test("a voucher Finance has reviewed but the GM has not verified has not reached them", () => {
  // The three "Finance Reviewed" rows in the signatories' list on 6 October.
  assert.equal(reachedSignatories({ status: "REVIEWED", approvals: [EXCO, FIN] }), false);
});

test("once Finance has reviewed and the GM verified, it is theirs", () => {
  assert.equal(reachedSignatories({ status: "REVIEWED", approvals: [EXCO, FIN, GM] }), true);
});

test("the status alone settles it once the backend has moved the voucher on", () => {
  // PENDING_SIGNATORY is set after the GM verifies, and APPROVED and PAID are
  // past it. None of them need the trail re-read.
  for (const status of ["PENDING_SIGNATORY", "APPROVED", "PAID"]) {
    assert.equal(reachedSignatories({ status, approvals: [] }), true, status);
  }
});

test("a voucher rejected before it got to them stays out of their list", () => {
  // Rejected at the ministry or by Finance. They were never asked.
  assert.equal(reachedSignatories({ status: "REJECTED_HEAD", approvals: [] }), false);
  assert.equal(reachedSignatories({ status: "REJECTED", approvals: [EXCO] }), false);
});

test("a voucher rejected after it got to them stays in it", () => {
  // They were asked, and the answer was no. Hiding that would lose the record
  // of a decision they were part of.
  assert.equal(reachedSignatories({ status: "REJECTED", approvals: [EXCO, FIN, GM] }), true);
});

test("a finance rejection is not a finance review", () => {
  // The trail holds the action, not merely the role.
  assert.equal(reachedSignatories({
    status: "REVIEWED",
    approvals: [{ role: "FINANCE_ADMIN", action: "REJECTED" }, GM],
  }), false);
});

test("the Accounts Executive's review counts, like any finance review", () => {
  assert.equal(reachedSignatories({
    status: "REVIEWED", approvals: [{ role: "FINANCE_ADMIN_2", action: "APPROVED" }, GM],
  }), true);
});

test("it agrees with the badge the voucher already wears", () => {
  // The badge says "Pending Signatory" from the same two approvals. If these
  // two ever disagreed, a voucher would be labelled as waiting on somebody who
  // could not see it.
  const cases = [
    { status: "PENDING", approvals: [] },
    { status: "PENDING", approvals: [FIN] },
    { status: "PENDING", approvals: [FIN, GM] },
    { status: "REVIEWED", approvals: [FIN, GM] },
  ];
  for (const pv of cases) {
    const badged = computedBadgeStatus(pv) === "PENDING_SIGNATORY";
    assert.equal(reachedSignatories(pv), badged, JSON.stringify(pv));
  }
});

test("a missing approvals list is not an error", () => {
  assert.equal(reachedSignatories({ status: "PENDING" }), false);
  assert.equal(reachedSignatories({ status: "PENDING", approvals: null }), false);
});
