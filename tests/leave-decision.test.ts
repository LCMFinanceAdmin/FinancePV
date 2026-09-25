// The rule that decides when a leave application is granted.
import test from "node:test";
import assert from "node:assert/strict";
import {
  outstandingApprovers, remainingApprovers, applyLeaveDecision,
  canActNow, waitingOnBefore, type RequiredApprover, type ApprovalEntry,
} from "@/lib/leave-decision";

const slot = (name: string, email: string, step?: number): RequiredApprover =>
  ({ name, email, step });
const approve = (email: string): ApprovalEntry =>
  ({ email, name: email, action: "APPROVED", timestamp: "2026-01-01T00:00:00Z" });
const names = (rs: RequiredApprover[]) => rs.map(r => r.name);

const GM_THEN_BISHOP = [slot("Jeffrey Koit", "gm@x", 1), slot("Bishop Thomas", "bishop@x", 2)];

test("an ordered chain waits on one step at a time", () => {
  assert.deepEqual(names(outstandingApprovers(GM_THEN_BISHOP, [])), ["Jeffrey Koit"]);

  const afterGm = applyLeaveDecision(GM_THEN_BISHOP, [], approve("gm@x"));
  assert.equal(afterGm.status, "PENDING", "one of two signatures does not grant it");
  assert.deepEqual(names(outstandingApprovers(GM_THEN_BISHOP, afterGm.approvals)), ["Bishop Thomas"]);

  const afterBishop = applyLeaveDecision(GM_THEN_BISHOP, afterGm.approvals, approve("bishop@x"));
  assert.equal(afterBishop.status, "APPROVED");
});

test("somebody further down the chain may not sign early", () => {
  assert.equal(canActNow(GM_THEN_BISHOP, [], "gm@x"), true);
  assert.equal(canActNow(GM_THEN_BISHOP, [], "bishop@x"), false);
  assert.deepEqual(names(waitingOnBefore(GM_THEN_BISHOP, [], "bishop@x")), ["Jeffrey Koit"]);
});

test("a rejection ends it from any step", () => {
  const out = applyLeaveDecision(GM_THEN_BISHOP, [], {
    email: "bishop@x", name: "Bishop", action: "REJECTED", timestamp: "2026-01-01T00:00:00Z",
  });
  assert.equal(out.status, "REJECTED");
});

test("a grouped slot is settled by any one of its members", () => {
  const anyOne = [
    { name: "Bishop", email: "b@x", group: "pastoral" },
    { name: "Dean", email: "d@x", group: "pastoral" },
    { name: "Pastor in Charge", email: "p@x", group: "pastoral" },
  ];
  assert.equal(outstandingApprovers(anyOne, []).length, 3, "all three are being waited on");
  assert.equal(applyLeaveDecision(anyOne, [], approve("d@x")).status, "APPROVED");
});

test("a chain written before steps existed still behaves as it did", () => {
  // Applications in flight carry no step. Unset must read as 1, or they would
  // change under the people signing them.
  const old = [slot("Jeffrey Koit", "gm@x"), slot("Bishop Thomas", "bishop@x")];
  assert.deepEqual(names(outstandingApprovers(old, [])), ["Jeffrey Koit", "Bishop Thomas"]);
  assert.equal(canActNow(old, [], "bishop@x"), true);
});

test("remaining counts every step, outstanding only the current one", () => {
  assert.equal(remainingApprovers(GM_THEN_BISHOP, []).length, 2);
  assert.equal(outstandingApprovers(GM_THEN_BISHOP, []).length, 1);
});

test("re-deciding replaces that person's entry rather than adding a second", () => {
  const once = applyLeaveDecision(GM_THEN_BISHOP, [], approve("gm@x"));
  const twice = applyLeaveDecision(GM_THEN_BISHOP, once.approvals, approve("gm@x"));
  assert.equal(twice.approvals.length, 1);
  assert.equal(twice.status, "PENDING");
});
