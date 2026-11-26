// Who has to sign, for each kind of person.
import test from "node:test";
import assert from "node:assert/strict";
import { leaveRouting, gapReason } from "@/lib/leave-approvers";

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

test("the General Manager's own leave goes to the Bishop alone", async () => {
  // He cannot be his own approver, which is the one remaining use of
  // BISHOP_ONLY. Every other member of office staff was taken off it in
  // October 2026 so the GM sees their application before the Bishop does.
  assert.equal(
    await chain({ user_roles: [BISHOP,
      { ...GM, reports_to: "BISHOP_ONLY" }] }, "gm@lcm"),
    "1:Bishop Thomas");
});

test("office staff reach the Bishop through the General Manager, not around him", async () => {
  // Communications and Trustees used to be set to BISHOP_ONLY, so an
  // application was granted without the General Manager ever seeing it.
  for (const who of ["comms@lcm", "trustees@lcm"]) {
    assert.equal(
      await chain({ user_roles: [BISHOP, GM,
        { email: "comms@lcm", full_name: "Siew Fun", role: "STAFF", reports_to: "GM_AND_BISHOP" },
        { email: "trustees@lcm", full_name: "Sean", role: "STAFF", reports_to: "GM_AND_BISHOP" }] }, who),
      "1:Jeffrey Koit  2:Bishop Thomas", who);
  }
});

test("a department head signs first, then the General Manager, then the Bishop", async () => {
  // Eddie Kwan is under Sean Cham at Trustees, so Sean still signs — the
  // General Manager was inserted between Sean and the Bishop rather than in
  // place of either, which is what "GM first, then Bishop for
  // acknowledgement" means for somebody who also has a department head.
  assert.equal(
    await chain({
      user_roles: [BISHOP, GM, { email: "eddie@lcm", full_name: "Eddie", role: "BUILDING_MANAGER" }],
      leave_approver_assignments: [
        { employee_email: "eddie@lcm", approver_email: "sean@lcm", approver_name: "Sean Cham", sort_order: 1 },
        { employee_email: "eddie@lcm", approver_email: "gm@lcm", approver_name: "Jeffrey Koit", sort_order: 2 },
        { employee_email: "eddie@lcm", approver_email: "bishop@lcm", approver_name: "Bishop Thomas", sort_order: 3 },
      ],
    }, "eddie@lcm"),
    "1:Sean Cham  2:Jeffrey Koit  3:Bishop Thomas");
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

test("somebody who fills two rungs is asked once, not twice", () => {
  // Every Dean also leads a congregation, so a pastor serving in the Dean's own
  // church has the same man as Pastor in Charge and as Dean. Six of the 52
  // congregations are in that position today, one per district.
  //
  // Asking him twice is not a second opinion, and between the two signatures
  // the application reads as pending on the man who has just signed it.
  return chain({
    congregations: [{ id: "c1", name: "Christ", head_pastor_email: "dean@lcm", district_id: "d1" }],
    districts: [{ id: "d1", name: "Central 2", dean_email: "dean@lcm" }],
    user_roles: [BISHOP, GM,
      { email: "pastor@lcm", full_name: "Pastor Eric", role: "STAFF", is_pastor: true, congregation_id: "c1" },
      { email: "dean@lcm", full_name: "The Dean", role: "STAFF", is_pastor: true, congregation_id: "c1" },
    ],
  }, "pastor@lcm").then(c => assert.equal(c, "1:The Dean"));
});

test("two different people still make two rungs", () => {
  // The guard above must collapse a repeat, not the chain itself.
  return chain({
    congregations: [{ id: "c1", name: "Hope", head_pastor_email: "head@lcm", district_id: "d1" }],
    districts: [{ id: "d1", name: "Central", dean_email: "dean@lcm" }],
    user_roles: [BISHOP, GM,
      { email: "pastor@lcm", full_name: "Pastor Sam", role: "STAFF", is_pastor: true, congregation_id: "c1" },
      { email: "head@lcm", full_name: "Head Pastor", role: "STAFF", is_pastor: true, congregation_id: "c1" },
      { email: "dean@lcm", full_name: "The Dean", role: "STAFF", is_pastor: true, congregation_id: "c1" },
    ],
  }, "pastor@lcm").then(c => assert.equal(c, "1:Head Pastor  2:The Dean"));
});

// ── A chain that fell back says so ─────────────────────────────────────────
//
// Falling back to the Bishop is right: leave must not wait on a directory
// entry somebody forgot. It is also indistinguishable, from the outside, from
// a chain that is working — the application is raised, the Bishop approves it,
// everybody is satisfied, and the Pastor in Charge and the Dean were never
// asked. With 52 congregations still to be set up, that is the difference
// between one record to fix and forty.

const gapOf = async (tables: Record<string, Row[]>, email: string) =>
  (await leaveRouting(directory({ ...EMPTY, ...tables }), email)).gap;

test("a pastor with no congregation falls back, and the fallback is named", async () => {
  const tables = { user_roles: [BISHOP,
    { email: "p@lcm", full_name: "Chan", role: "STAFF", is_pastor: true }] };
  // It still routes — nobody is refused leave over a missing record.
  assert.equal(await chain(tables, "p@lcm"), "1:Bishop Thomas");
  assert.equal(await gapOf(tables, "p@lcm"), "NO_CONGREGATION");
});

test("a congregation with no Pastor in Charge and no Dean is a different gap", async () => {
  // Worth telling apart: one is fixed on the person, the other on the
  // congregation or the district, and being sent to the wrong screen is how a
  // warning gets ignored.
  const tables = {
    user_roles: [BISHOP, { email: "p@lcm", full_name: "Chan", role: "STAFF",
                           is_pastor: true, congregation_id: "c1" }],
    congregations: [{ id: "c1", name: "Somewhere", district_id: "d1" }],
    districts: [{ id: "d1", name: "Northern" }],
  };
  assert.equal(await chain(tables, "p@lcm"), "1:Bishop Thomas");
  assert.equal(await gapOf(tables, "p@lcm"), "NOBODY_ABOVE");
});

test("a complete pastoral chain reports no gap", async () => {
  const tables = {
    user_roles: [BISHOP,
      { email: "p@lcm", full_name: "Chan", role: "STAFF", is_pastor: true, congregation_id: "c1" },
      { email: "head@lcm", full_name: "Reena", role: "STAFF" },
      { email: "dean@lcm", full_name: "Phillip", role: "STAFF" }],
    congregations: [{ id: "c1", name: "Rawang", district_id: "d1", head_pastor_email: "head@lcm" }],
    districts: [{ id: "d1", name: "Central 3", dean_email: "dean@lcm" }],
  };
  assert.equal(await chain(tables, "p@lcm"), "1:Reena  2:Phillip");
  assert.equal(await gapOf(tables, "p@lcm"), null);
});

test("a Dean's own chain is the Bishop and is not a fallback", async () => {
  // The Dean has no congregation either, and going to the Bishop is the rule
  // for them rather than a gap. Reporting it would cry wolf on six of the
  // eleven accounts and teach everyone to ignore the warning.
  const tables = {
    user_roles: [BISHOP, { email: "dean@lcm", full_name: "Phillip", role: "STAFF", is_pastor: true }],
    districts: [{ id: "d1", name: "Central 2", dean_email: "dean@lcm" }],
  };
  assert.equal(await chain(tables, "dean@lcm"), "1:Bishop Thomas");
  assert.equal(await gapOf(tables, "dean@lcm"), null);
});

test("the Bishop's empty chain is the rule, not a gap", async () => {
  const tables = { user_roles: [BISHOP] };
  assert.equal(await chain(tables, "bishop@lcm"), "GRANTED ON SUBMISSION");
  assert.equal(await gapOf(tables, "bishop@lcm"), null);
});

test("staff and assigned approvers report no gap", async () => {
  assert.equal(await gapOf({ user_roles: [BISHOP, GM,
    { email: "fin@lcm", full_name: "Jermaine", role: "FINANCE_ADMIN", reports_to: "GM_AND_BISHOP" }] },
    "fin@lcm"), null);
  assert.equal(await gapOf({
    user_roles: [BISHOP, { email: "x@lcm", full_name: "X", role: "STAFF", is_pastor: true }],
    leave_approver_assignments: [{ employee_email: "x@lcm", approver_email: "a@lcm",
                                   approver_name: "Assigned", sort_order: 1 }],
  }, "x@lcm"), null);
});

test("nobody at all to sign is named as its own fault", async () => {
  // No Bishop on record. It has never happened; it would strand every
  // application, and "falls back to the Bishop" would be a lie about it.
  assert.equal(await gapOf({ user_roles: [
    { email: "p@lcm", full_name: "Chan", role: "STAFF", is_pastor: true }] }, "p@lcm"),
    "NO_APPROVER");
});

test("every gap says something, and no gap says nothing", () => {
  for (const g of ["NO_CONGREGATION", "NOBODY_ABOVE", "NO_APPROVER"] as const) {
    assert.ok(gapReason(g).length > 20, g);
  }
  assert.equal(gapReason(null), "");
});
