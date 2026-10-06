// What the sidebar offers, and to whom.
//
// These are permission rules wearing a menu's clothing: `show` decides both
// what a person is pointed at and what they are left unable to find. The leave
// queue is the cautionary one — the page itself never checked a role, so the
// nav was the only thing standing between an approver and the application
// waiting on them, and for one kind of approver it was standing in the way.
import test from "node:test";
import assert from "node:assert/strict";
import { visibleGroups, visiblePinned } from "@/lib/nav";
import type { UserProfile } from "@/lib/types";

const base = {
  id: "x", email: "x@lcm.org.my", full_name: "X", ministries: [],
  isFinanceAdmin: false, isSignatory: false, signatoryRole: "",
  isMinistryHead: false, isLcmStaff: true,
} as unknown as UserProfile;

const who = (over: Partial<UserProfile>) => ({ ...base, ...over }) as UserProfile;

const TREASURER = who({ role: "TREASURER" as never, isSignatory: true });
const BISHOP    = who({ role: "BISHOP" as never, isSignatory: true });
/** Signs for the staff member under him; holds no role that says so. */
const DEPT_HEAD = who({ role: "STAFF" as never, isLeaveApprover: true });
const VOLUNTEER = who({ role: "MINISTRY_HEAD" as never, isMinistryHead: true });

const pinned = (u: UserProfile) => visiblePinned(u).map(i => i.href);
/** What the sidebar renders: groups, with anything already pinned removed. */
const nested = (u: UserProfile) => visibleGroups(u, true).flatMap(g => g.items.map(i => i.href));

test("a signatory reaches vouchers, leave and the budget without opening a group", () => {
  // The three things they asked for, each one click from anywhere.
  assert.deepEqual(pinned(BISHOP),
    ["/signatory", "/leave-queue", "/budget", "/submit"]);
});

test("a signatory who does not sign leave is not offered the leave queue", () => {
  // The Treasurer is on nobody's chain, and a queue that is always empty is
  // worse than no entry at all.
  assert.deepEqual(pinned(TREASURER), ["/signatory", "/budget", "/submit"]);
});

test("an assigned approver finds the leave queue although no role grants it", () => {
  // Before this he had no route to the page at all: the queue was shown to the
  // General Manager, the Bishop, Deans and pastors, and he is none of them.
  assert.ok(pinned(DEPT_HEAD).includes("/leave-queue"));
});

test("somebody who approves no leave is not sent to the queue", () => {
  assert.ok(!pinned(VOLUNTEER).includes("/leave-queue"));
  assert.ok(!nested(VOLUNTEER).includes("/leave-queue"));
});

test("nothing is offered twice", () => {
  for (const u of [TREASURER, BISHOP, DEPT_HEAD, VOLUNTEER]) {
    const all = [...pinned(u), ...nested(u)];
    assert.deepEqual([...new Set(all)], all, `${u.role} sees a duplicate`);
  }
});

test("the feature directory still lists what the sidebar pins", () => {
  // It is a map of everything reachable. A page missing from the map because
  // it happens to be pinned would defeat the point of having one.
  const everything = visibleGroups(BISHOP).flatMap(g => g.items.map(i => i.href));
  for (const href of ["/signatory", "/leave-queue", "/budget"]) {
    assert.ok(everything.includes(href), `${href} missing from the directory`);
  }
});

test("a signatory has no dashboard, which is why the pins carry the weight", () => {
  // /dashboard redirects them to the voucher queue, so the sidebar is the whole
  // of their navigation.
  assert.ok(!pinned(BISHOP).includes("/dashboard"));
  assert.ok(pinned(DEPT_HEAD).includes("/dashboard"));
});
