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
const GM        = who({ role: "GENERAL_MANAGER" as never, isSignatory: true, isGeneralManager: true });
const ADMIN     = who({ role: "ADMINISTRATOR" as never, isAdministrator: true });
const FINANCE   = who({ role: "FINANCE_ADMIN" as never, isFinanceAdmin: true });
const STAFF     = who({ role: "STAFF" as never });

const pinned = (u: UserProfile) => visiblePinned(u).map(i => i.href);
/** What the sidebar renders: groups, with anything already pinned removed. */
const nested = (u: UserProfile) => visibleGroups(u, true).flatMap(g => g.items.map(i => i.href));

test("a signatory reaches vouchers, leave and the budget without opening a group", () => {
  // The three things they asked for, each one click from anywhere. /submit was
  // in this list only because it used to be pinned for every role; it is now
  // in the claim group, which is where a signatory claiming petrol looks for
  // it. The three decisions are what this test is about and they are unmoved.
  assert.deepEqual(pinned(BISHOP), ["/signatory", "/leave-queue", "/budget"]);
});

test("a signatory who does not sign leave is not offered the leave queue", () => {
  // The Treasurer is on nobody's chain, and a queue that is always empty is
  // worse than no entry at all.
  assert.deepEqual(pinned(TREASURER), ["/signatory", "/budget"]);
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

const adminGroup = (u: UserProfile) =>
  (visibleGroups(u, true).find(g => g.id === "admin")?.items ?? []).map(i => i.label);

test("the records are not in a signatory's sidebar", () => {
  // Six entries of record-keeping sat above the three things they are in the
  // app to do. They asked for them to go.
  const kept = adminGroup(BISHOP);
  for (const gone of ["People Directory", "Offices & Elections", "Official Registers", "Access & Roles"]) {
    assert.ok(!kept.includes(gone), `${gone} is still offered to a signatory`);
  }
});

test("what a signatory keeps is what helps them decide", () => {
  // The rates behind a claim they are about to sign, and reference data that
  // carries no personal detail.
  assert.deepEqual(adminGroup(TREASURER), ["Claim Entitlements", "Partners & Organisations"]);
});

test("the General Manager keeps the records, being a signatory and an administrator both", () => {
  // He is in signatoryRoles, so a rule written as "not a signatory" would have
  // taken the directory off the person who most needs it.
  for (const needed of ["People Directory", "Offices & Elections", "Access & Roles"]) {
    assert.ok(adminGroup(GM).includes(needed), `the GM lost ${needed}`);
  }
});

test("the Administrator is untouched, since the records are hers", () => {
  for (const needed of ["People Directory", "Offices & Elections", "Official Registers"]) {
    assert.ok(adminGroup(ADMIN).includes(needed), `the Administrator lost ${needed}`);
  }
});

test("there is one place a signatory approves a voucher, not two", () => {
  // "My Approvals" and "Approve Vouchers" ended up showing the same vouchers
  // and offering the same Approve and Reject, which is what the signatories
  // asked about. The queue is the one that stayed.
  for (const u of [TREASURER, BISHOP]) {
    const all = [...pinned(u), ...nested(u)];
    assert.ok(all.includes("/signatory"), "the queue is missing");
    assert.ok(!all.includes("/hod-activity"), "the second approvals list is still offered");
  }
});

test("a signatory's whole sidebar is short enough to read without scrolling", () => {
  // The complaint that started this: three decisions buried among twenty-odd
  // entries. This is a ceiling, not a target — if a genuine need pushes past
  // it, raise it deliberately rather than by accident.
  const total = pinned(BISHOP).length + nested(BISHOP).length;
  assert.ok(total <= 16, `a Bishop is offered ${total} entries`);
});

// ── Claiming, and who is told they are doing it ────────────────────────────
//
// The submit page has always written a payment request rather than a voucher
// for anyone outside Finance and the GM. The sidebar said "Submit PV" to all
// of them, which named something the page would not do for the person reading
// it, and parked the only way of tracking it in a "Payments" group that sounds
// like Finance's own work.

test("a claimant is offered the claim form, not a voucher", () => {
  assert.ok(!pinned(STAFF).includes("/submit"));
  const claims = visibleGroups(STAFF, true).find(g => g.id === "claims");
  assert.ok(claims, "no claim group for staff");
  assert.equal(claims.label, "Submit PR (Claim Form)");
  assert.deepEqual(claims.items.map(i => i.href), ["/submit", "/payment-requests"]);
});

test("Finance raises vouchers, so keeps the pinned entry and the Payments group", () => {
  assert.ok(pinned(FINANCE).includes("/submit"));
  assert.ok(!visibleGroups(FINANCE, true).some(g => g.id === "claims"));
  assert.ok(nested(FINANCE).includes("/payment-requests"));
});

test("the General Manager raises vouchers directly and is not a claimant", () => {
  // Same branch as the submit page's canRaisePvDirectly. Getting this wrong
  // would also strip Banking from him, which only he and Finance can open.
  assert.ok(pinned(GM).includes("/submit"));
  assert.ok(!visibleGroups(GM, true).some(g => g.id === "claims"));
  assert.ok(nested(GM).includes("/banking"));
});

test("Payments disappears for a claimant rather than standing empty", () => {
  assert.ok(!visibleGroups(STAFF, true).some(g => g.id === "payments"));
});

test("the Administrator may claim, and still cannot reach the money", () => {
  // She keeps the church's records. Moving an entry is no reason to hand her
  // one she was deliberately kept out of.
  const claims = visibleGroups(ADMIN, true).find(g => g.id === "claims");
  assert.deepEqual(claims?.items.map(i => i.href), ["/submit"]);
  assert.ok(!nested(ADMIN).includes("/payment-requests"));
});

test("a claimant is never offered the same page twice", () => {
  for (const u of [STAFF, ADMIN, BISHOP, VOLUNTEER]) {
    const all = [...pinned(u), ...nested(u)];
    assert.deepEqual([...new Set(all)], all, `${u.role} sees a duplicate`);
  }
});
