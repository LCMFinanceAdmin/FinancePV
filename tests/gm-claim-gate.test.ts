// Finance raises the voucher on the General Manager's instruction.
//
// 085 wrote that down — AWAITING_GM means "GM to accept", ACCEPTED means "the
// PV can now be raised" — and then nothing checked it, so Create PV sat live
// on a row still waiting. These are the four places that now ask.
import test from "node:test";
import assert from "node:assert/strict";
import { awaitsGm, canRaisePv, awaitingGmReason } from "@/lib/gm-claim-gate";

test("a claim the GM has not accepted is not Finance's to raise", () => {
  assert.equal(canRaisePv({ gm_status: "AWAITING_GM" }), false);
  assert.equal(awaitsGm({ gm_status: "AWAITING_GM" }), true);
});

test("once accepted, it is", () => {
  assert.equal(canRaisePv({ gm_status: "ACCEPTED" }), true);
});

test("a claim the GM logged himself needs no acceptance", () => {
  // 085 defaulted the column to ACCEPTED for exactly this reason, but a row
  // read before the column existed, or selected without it, arrives as
  // undefined — and a missing status must not close the gate on a claim that
  // was never waiting on anybody.
  assert.equal(canRaisePv({}), true);
  assert.equal(canRaisePv({ gm_status: null }), true);
});

test("the reason names the claim, because Finance has a screen full of them", () => {
  assert.match(awaitingGmReason("CLM-2026-006"), /CLM-2026-006/);
  assert.match(awaitingGmReason(null), /this claim/);
});
