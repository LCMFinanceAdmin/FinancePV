// The checker's step on a payment voucher.
//
// An EXCO Member appoints one person per ministry to confirm the particulars
// and amounts. Confirming is not approving: the voucher goes back to the EXCO
// to verify — unless they have delegated that budget line to the checker, in
// which case the one act does both.
//
// The handler under test is supabase/functions/ministry-action/index.ts, run
// as it is. Only the two modules that reach outside the process are stood in
// for, plus Deno itself.
import test from "node:test";
import assert from "node:assert/strict";
import { pvWorld, resetPv } from "./helpers/pv-world.ts";

// Deno.serve runs at module load and hands over the request handler, so the
// shim has to be in place before the import below.
let handler: ((req: unknown) => Promise<Response>) | null = null;
(globalThis as unknown as { Deno: unknown }).Deno = {
  serve: (h: (req: unknown) => Promise<Response>) => { handler = h; },
  env: { get: () => "stub" },
};
// Imported through a variable so TypeScript does not pull the Deno source
// into this directory's type graph. It is written for Deno — its own runtime,
// its own config, its own checker — and typechecking it here reports faults
// about `Deno` and npm: specifiers that are not faults there. Node still
// resolves and runs the real file; see tests/helpers/hooks.mjs.
const EDGE_FUNCTION = "@/supabase/functions/ministry-action/index.ts";
await import(EDGE_FUNCTION);

const EXCO    = { email: "benson@lcm", full_name: "Benson Yeoh", role: "EXCO_ORANG_ASLI", ministries: ["Orang Asli"] };
const CHECKER = { email: "thomas@lcm", full_name: "Thomas Lim", role: "MINISTRY_SUPPORT", ministries: [] as string[] };
const OUTSIDER= { email: "someone@lcm", full_name: "Someone Else", role: "STAFF", ministries: [] as string[] };

function voucher(status = "PENDING_CHECK", project: string | null = "Camp") {
  resetPv();
  pvWorld.tables = {
    user_roles: [EXCO, CHECKER, OUTSIDER],
    ministries: [{ name: "Orang Asli", checker_email: CHECKER.email, checker_name: CHECKER.full_name }],
    ministry_heads: [{ ministry: "Orang Asli", email: EXCO.email }],
    pvs: [{
      id: "pv1", pv_no: "PV-TEST-0001", status, ministry: "Orang Asli", project,
      approvals: [], ministry_verified: "NO", head_verified: "NO",
      submitted_by_email: "finance@lcm", payee_name: "A Payee",
    }],
  };
}

const pv = () => pvWorld.tables.pvs[0] as Record<string, unknown>;

async function act(as: { email: string }, action: string) {
  pvWorld.user = { email: as.email };
  const res = await handler!({
    method: "POST",
    headers: { get: () => "Bearer stub" },
    json: async () => ({ pv_id: "pv1", action }),
  });
  return { status: res.status, body: await res.json() };
}

test("the checker confirms, and it goes back to the EXCO to verify", async () => {
  voucher();
  const r = await act(CHECKER, "CHECKED");
  assert.equal(r.status, 200);
  assert.equal(pv().status, "PENDING_HEAD", "back with the committee, not onward");
  assert.equal(pv().checked_by_name, "Thomas Lim");
  assert.ok(pv().checked_at, "and dated");
  assert.equal(pv().ministry_verified, "NO", "checking is not verifying");
  assert.ok(pvWorld.notifications.some(n => n.recipient_email === EXCO.email),
    "the EXCO is told it is ready for them");
});

test("a budget line delegated to the checker settles it outright", async () => {
  voucher();
  // The same delegation that lets the Education Desk verify what Education
  // books, scoped to one line.
  pvWorld.delegations = [{ email: CHECKER.email, ministry: "Orang Asli", project: "Camp" }];
  const r = await act(CHECKER, "CHECKED");
  assert.equal(r.status, 200);
  assert.equal(pv().status, "PENDING", "straight on to Finance");
  assert.equal(pv().ministry_verified, "YES");
  assert.equal(pv().ministry_verified_by, "Thomas Lim");
  const entry = (pv().approvals as Record<string, unknown>[]).at(-1)!;
  assert.equal(entry.action, "CHECKED_AND_VERIFIED");
  assert.equal(entry.delegated, true, "recorded as given on the EXCO's behalf");
});

test("a delegation for one budget line does not cover another", async () => {
  voucher("PENDING_CHECK", "Fellowship Night");
  pvWorld.delegations = [{ email: CHECKER.email, ministry: "Orang Asli", project: "Camp" }];
  await act(CHECKER, "CHECKED");
  assert.equal(pv().status, "PENDING_HEAD", "this one still needs the EXCO");
});

test("a ministry with no EXCO does not strand the voucher", async () => {
  // Several ministries have nobody assigned. Without a checker such a voucher
  // went straight to Finance; with one it must not stop at a committee that
  // does not exist.
  voucher();
  pvWorld.tables.user_roles = [CHECKER, OUTSIDER];   // nobody holds Orang Asli
  await act(CHECKER, "CHECKED");
  assert.equal(pv().status, "PENDING", "on to Finance, as it would have gone anyway");
  assert.equal(pv().head_verified, "N/A", "and does not claim a verification is outstanding");
});

test("only the appointed checker may confirm the particulars", async () => {
  voucher();
  const r = await act(OUTSIDER, "CHECKED");
  assert.equal(r.status, 403);
  assert.equal(pv().status, "PENDING_CHECK", "untouched");
});

test("a voucher not waiting on a check cannot be checked", async () => {
  voucher("PENDING_HEAD");
  const r = await act(CHECKER, "CHECKED");
  assert.equal(r.status, 400);
  assert.match(String(r.body.error), /not waiting on a check/);
});
