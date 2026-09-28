// Where a new payment voucher goes the moment it is raised.
//
// Four answers, and which one applies decides whether a committee ever sees
// the spending: straight to Finance, to the ministry's EXCO, to the person
// appointed to check the particulars, or already verified.
//
// The handler is supabase/functions/submit-pv/index.ts, run as it is.
import test from "node:test";
import assert from "node:assert/strict";
import { pvWorld, resetPv } from "./helpers/pv-world.ts";

let handler: ((req: unknown) => Promise<Response>) | null = null;
(globalThis as unknown as { Deno: unknown }).Deno = {
  serve: (h: (req: unknown) => Promise<Response>) => { handler = h; },
  env: { get: () => "stub" },
};
// Through a variable: see tests/pv-checker.test.ts for why.
const EDGE_FUNCTION = "@/supabase/functions/submit-pv/index.ts";
await import(EDGE_FUNCTION);

const FINANCE = { email: "finance@lcm", full_name: "Jermaine Aaron", role: "FINANCE_ADMIN", ministries: [] as string[] };
const CHECKER = { email: "thomas@lcm", full_name: "Thomas Lim", role: "MINISTRY_SUPPORT", ministries: [] as string[] };
const STAFF   = { email: "someone@lcm", full_name: "Someone", role: "STAFF", ministries: [] as string[] };

/** A directory, with the knobs each test wants to turn. */
function world(opts: {
  deptHead?: string | null;
  checker?: string | null;
} = {}) {
  resetPv();
  pvWorld.tables = {
    user_roles: [FINANCE, CHECKER, STAFF],
    departments: [{ name: "Missions", head_email: opts.deptHead ?? "", head_name: opts.deptHead ? "A Head" : "" }],
    ministries: [{
      name: "Orang Asli",
      checker_email: opts.checker ?? null,
      checker_name: opts.checker ? "Thomas Lim" : null,
    }, { name: "HQ", checker_email: null, checker_name: null }],
    ministry_heads: [{ ministry: "Orang Asli", email: "benson@lcm", name: "Benson Yeoh" }],
    pvs: [],
  };
}

async function submit(as: { email: string }, body: Record<string, unknown>) {
  pvWorld.user = { email: as.email };
  const res = await handler!({
    method: "POST",
    headers: { get: () => "Bearer stub" },
    json: async () => ({
      dept: "Missions", ministry: "Orang Asli", project: "Camp",
      payee_name: "A Payee", line_items: [{ description: "Fuel", amount: 222 }],
      ...body,
    }),
  });
  return { status: res.status, body: await res.json() };
}

const raised = () => (pvWorld.tables.pvs ?? []).at(-1) as Record<string, unknown>;

test("HQ office expenses go straight to Finance", async () => {
  // No committee sits above the office, so there is nobody to verify first.
  world({ deptHead: "ahead@lcm" });
  for (const ministry of ["HQ", "Head Quarters (HQ)", "LCM HQ Office"]) {
    const r = await submit(FINANCE, { ministry });
    assert.equal(r.status, 200, `${ministry}: accepted`);
    assert.equal(r.body.status, "PENDING", `${ministry}: with Finance`);
    assert.equal(raised().head_verified, "N/A",
      `${ministry}: and does not claim a verification is outstanding`);
  }
});

test("an ordinary ministry with a department head goes to the EXCO", async () => {
  world({ deptHead: "ahead@lcm" });
  const r = await submit(FINANCE, {});
  assert.equal(r.body.status, "PENDING_HEAD");
  assert.equal(raised().head_verified, "NO");
});

test("with nobody to verify, it goes to Finance rather than nowhere", async () => {
  world({ deptHead: null });
  const r = await submit(FINANCE, {});
  assert.equal(r.body.status, "PENDING");
  assert.equal(raised().head_verified, "N/A");
});

test("where a checker is appointed, the voucher reaches them first", async () => {
  world({ deptHead: "ahead@lcm", checker: CHECKER.email });
  const r = await submit(FINANCE, {});
  assert.equal(r.body.status, "PENDING_CHECK", "Finance raised it, so the checker confirms it");
  assert.equal(raised().checked_by_email, null, "and nothing is recorded as checked yet");
});

test("a voucher the checker raised is already checked", async () => {
  // They collect the receipts and raise the claim; asking them to confirm
  // their own paperwork a second time is asking them to agree with themselves.
  world({ deptHead: "ahead@lcm", checker: CHECKER.email });
  // Finance roles raise vouchers directly; the checker does so as one of them
  // in this test, which is how a ministry desk with Finance rights would.
  pvWorld.tables.user_roles = [{ ...CHECKER, role: "FINANCE_ADMIN" }, FINANCE, STAFF];
  const r = await submit(CHECKER, {});
  assert.notEqual(r.body.status, "PENDING_CHECK", "not sent back to themselves");
  assert.equal(raised().checked_by_email, CHECKER.email, "the check is recorded as theirs");
  assert.ok(raised().checked_at, "and dated");
});

test("a checker who holds the budget line needs no second signature", async () => {
  world({ deptHead: "ahead@lcm", checker: CHECKER.email });
  pvWorld.tables.user_roles = [{ ...CHECKER, role: "FINANCE_ADMIN" }, FINANCE, STAFF];
  pvWorld.delegations = [{ email: CHECKER.email, ministry: "Orang Asli", project: "Camp" }];
  const r = await submit(CHECKER, {});
  assert.equal(r.body.status, "PENDING", "straight to Finance");
  assert.equal(raised().ministry_verified, "YES");
  assert.equal(raised().head_verified, "N/A");
});

test("a voucher raised from an approved request is not verified twice", async () => {
  world({ deptHead: "ahead@lcm" });
  const r = await submit(FINANCE, { exco_verified_by: "Benson Yeoh" });
  assert.equal(r.body.status, "PENDING");
  assert.equal(raised().head_verified, "YES");
});

test("everyone outside Finance and the GM must raise a request instead", async () => {
  // The form has always worked this way; the endpoint did not, so the request
  // stage was a convention rather than a rule.
  world({ deptHead: "ahead@lcm" });
  const r = await submit(STAFF, {});
  assert.equal(r.status, 403);
  assert.match(String(r.body.error), /Payment Request/);
});

test("the voucher's amount is its line items, not a number sent alongside", async () => {
  // A voucher could otherwise print RM 80,000 and need one signature.
  world({ deptHead: null });
  await submit(FINANCE, { amount: 5, line_items: [{ description: "Fuel", amount: 222 }, { description: "Toll", amount: 18 }] });
  assert.equal(raised().amount, 240);
});
