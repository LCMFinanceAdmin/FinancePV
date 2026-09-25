// Who has to sign, for each kind of person.
import test from "node:test";
import assert from "node:assert/strict";
import { leaveRouting } from "@/lib/leave-approvers";

type Row = Record<string, unknown>;
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** A directory small enough to read, shaped enough for the rules to run. */
function directory(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const eqs: Record<string, unknown> = {};
    const rows = () => (tables[table] ?? []).filter(r =>
      Object.entries(eqs).every(([c, v]) => norm(r[c]) === norm(v)));
    const q = {
      select: () => q,
      order: () => q,
      eq: (c: string, v: unknown) => { eqs[c] = v; return q; },
      maybeSingle: async () => ({ data: rows()[0] ?? null }),
      single: async () => ({ data: rows()[0] ?? null }),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows() }).then(res, rej),
    };
    return q;
  };
  // The rules only ever call .from(); the cast keeps the test honest about that.
  return { from } as unknown as Parameters<typeof leaveRouting>[0];
}

const BISHOP = { email: "bishop@lcm", full_name: "Bishop Thomas", role: "BISHOP" };
const GM = { email: "gm@lcm", full_name: "Jeffrey Koit", role: "GENERAL_MANAGER" };
const EMPTY = { leave_approver_assignments: [], districts: [], congregations: [] };

/** "1:Name  2:Name", or what happened instead of a chain. */
async function chain(tables: Record<string, Row[]>, email: string) {
  const r = await leaveRouting(directory({ ...EMPTY, ...tables }), email);
  return r.notifyOnly
    ? "GRANTED ON SUBMISSION"
    : r.approvers.map(a => `${a.step ?? "-"}:${a.name}`).join("  ");
}

test("staff report through the General Manager, then the Bishop", async () => {
  assert.equal(
    await chain({ user_roles: [BISHOP, GM,
      { email: "fin@lcm", full_name: "Jermaine", role: "FINANCE_ADMIN", reports_to: "GM_AND_BISHOP" }] }, "fin@lcm"),
    "1:Jeffrey Koit  2:Bishop Thomas");
});

test("somebody set to report to the Bishop alone has a chain of one", async () => {
  assert.equal(
    await chain({ user_roles: [BISHOP, GM,
      { email: "sean@lcm", full_name: "Sean", role: "STAFF", reports_to: "BISHOP_ONLY" }] }, "sean@lcm"),
    "1:Bishop Thomas");
});

test("the Bishop's own leave is granted on submission", async () => {
  assert.equal(await chain({ user_roles: [BISHOP, GM] }, "bishop@lcm"), "GRANTED ON SUBMISSION");
});

test("an assignment overrides the rules, in its own order", async () => {
  assert.equal(
    await chain({
      user_roles: [BISHOP, GM, { email: "eddie@lcm", full_name: "Eddie", role: "BUILDING_MANAGER" }],
      leave_approver_assignments: [
        { employee_email: "eddie@lcm", approver_email: "sean@lcm", approver_name: "Sean Cham", sort_order: 1 },
        { employee_email: "eddie@lcm", approver_email: "bishop@lcm", approver_name: "Bishop Thomas", sort_order: 2 },
      ],
    }, "eddie@lcm"),
    "1:Sean Cham  2:Bishop Thomas");
});

const PASTORAL = {
  congregations: [{ id: "c1", name: "Hope", head_pastor_email: "head@lcm", district_id: "d1" }],
  districts: [{ id: "d1", name: "Central", dean_email: "dean@lcm" }],
  user_roles: [BISHOP, GM,
    { email: "pastor@lcm", full_name: "Pastor Sam", role: "STAFF", is_pastor: true, congregation_id: "c1" },
    { email: "head@lcm", full_name: "Head Pastor", role: "STAFF", is_pastor: true, congregation_id: "c1" },
    { email: "dean@lcm", full_name: "The Dean", role: "STAFF", is_pastor: true, congregation_id: "c1" },
  ],
};

test("a pastor climbs one rung at a time", async () => {
  assert.equal(await chain(PASTORAL, "pastor@lcm"), "1:Head Pastor  2:The Dean");
  assert.equal(await chain(PASTORAL, "head@lcm"), "1:The Dean  2:Bishop Thomas");
  assert.equal(await chain(PASTORAL, "dean@lcm"), "1:Bishop Thomas");
});

test("a rung nobody fills is skipped rather than blocking", async () => {
  // Most congregations have no Pastor in Charge recorded. That is a gap in the
  // directory, not a reason to refuse somebody their leave.
  assert.equal(
    await chain({ ...PASTORAL,
      congregations: [{ id: "c1", name: "Hope", head_pastor_email: null, district_id: "d1" }] }, "pastor@lcm"),
    "1:The Dean");
});

test("a pastor with nobody above them falls back to the Bishop", async () => {
  assert.equal(
    await chain({ ...PASTORAL,
      user_roles: [BISHOP, GM, { email: "lone@lcm", full_name: "Lone", role: "STAFF", is_pastor: true }] },
      "lone@lcm"),
    "1:Bishop Thomas");
});
