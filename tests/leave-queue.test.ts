// Whose queue a leave application lands in.
import test from "node:test";
import assert from "node:assert/strict";
import { partitionQueue, isMyTurn, isOnChain, slotIsMine, type Viewer } from "@/lib/leave-queue";

const GM     = { email: "gm@lcm", name: "Jeffrey Koit", position: "General Manager", step: 1 };
const BISHOP = { email: "bishop@lcm", name: "Bishop Thomas", position: "Bishop", step: 2 };

const leave = (over: Record<string, unknown> = {}) => ({
  leave_no: "LV-2026-001", status: "PENDING",
  required_approvers: [GM, BISHOP],
  approvals: [] as { email?: string; name: string; action: string; timestamp: string }[],
  ...over,
});
const approved = (email: string) =>
  ({ email, name: email, action: "APPROVED", timestamp: "2026-01-01T00:00:00Z" });

const asGm: Viewer     = { email: GM.email, role: "GENERAL_MANAGER" };
const asBishop: Viewer = { email: BISHOP.email, role: "BISHOP" };
const asOther: Viewer  = { email: "someone@lcm", role: "STAFF" };

test("an ordered chain is with the first step, and only the first step", () => {
  const l = leave();
  assert.equal(isMyTurn(l, asGm), true);
  assert.equal(isMyTurn(l, asBishop), false, "named, but not yet asked");
  assert.equal(isOnChain(l, asBishop), true, "still on the chain");
});

test("the Bishop's queue shows it as not his, rather than as actionable", () => {
  // Otherwise he presses Approve and is told "this is waiting on Jeffrey Koit
  // first", which is a poor way to learn it was never his turn.
  const q = partitionQueue([leave()], asBishop);
  assert.equal(q.pending.length, 0);
  assert.equal(q.awaitingOthers.length, 1);
});

test("and it is in the General Manager's queue, waiting on him", () => {
  const q = partitionQueue([leave()], asGm);
  assert.equal(q.pending.length, 1);
  assert.equal(q.awaitingOthers.length, 0);
});

test("once he signs, it moves to the Bishop and out of the GM's queue", () => {
  const signed = leave({ approvals: [approved(GM.email)] });
  const gmQ = partitionQueue([signed], asGm);
  assert.equal(gmQ.pending.length, 0, "nothing more is asked of him");
  assert.equal(gmQ.awaitingOthers.length, 1, "but it is not history either");

  const bishopQ = partitionQueue([signed], asBishop);
  assert.equal(bishopQ.pending.length, 1, "now it is his");
});

test("somebody on nobody's chain sees none of it", () => {
  const q = partitionQueue([leave()], asOther);
  assert.equal(q.pending.length + q.awaitingOthers.length + q.history.length, 0);
});

test("a settled application is history, not a queue item", () => {
  for (const status of ["APPROVED", "REJECTED", "CANCELLED"]) {
    const q = partitionQueue([leave({ status })], asGm);
    assert.equal(q.pending.length, 0, status);
    assert.equal(q.history.length, 1, status);
  }
});

test("a successor sees what their predecessor was named for", () => {
  // The post changed hands. Matching on address alone would strand the
  // application: the outgoing General Manager is still named on it, and the
  // incoming one would see nothing.
  const newGm: Viewer = {
    email: "newgm@lcm", role: "GENERAL_MANAGER",
    roleByEmail: { "gm@lcm": "GENERAL_MANAGER" },
  };
  assert.equal(slotIsMine(GM, newGm), true);
  assert.equal(partitionQueue([leave()], newGm).pending.length, 1);
});

test("holding a different role does not inherit somebody else's slot", () => {
  const treasurer: Viewer = {
    email: "treasurer@lcm", role: "TREASURER",
    roleByEmail: { "gm@lcm": "GENERAL_MANAGER" },
  };
  assert.equal(slotIsMine(GM, treasurer), false);
  assert.equal(partitionQueue([leave()], treasurer).pending.length, 0);
});

test("a grouped chain is with all of its members at once", () => {
  // A pastor's leave under the old rule: any one of three settles it, so all
  // three are being waited on until one does.
  const pastoral = leave({
    required_approvers: [
      { email: "bishop@lcm", name: "Bishop", group: "pastoral" },
      { email: "dean@lcm", name: "Dean", group: "pastoral" },
    ],
  });
  assert.equal(partitionQueue([pastoral], asBishop).pending.length, 1);
  assert.equal(partitionQueue([pastoral], { email: "dean@lcm" }).pending.length, 1);
});

test("the one an email was about is put at the top", () => {
  const a = leave({ leave_no: "LV-2026-001" });
  const b = leave({ leave_no: "LV-2026-002" });
  const q = partitionQueue([a, b], asGm, "LV-2026-002");
  assert.equal(q.pending[0].leave_no, "LV-2026-002", "so a long queue cannot bury it");
});

test("a chain with no steps behaves as it did before there were any", () => {
  // Applications already in flight carry no step; both approvers are open at
  // once, which is what the people signing them were told.
  const old = leave({
    required_approvers: [{ email: GM.email, name: "GM" }, { email: BISHOP.email, name: "Bishop" }],
  });
  assert.equal(partitionQueue([old], asGm).pending.length, 1);
  assert.equal(partitionQueue([old], asBishop).pending.length, 1);
});
