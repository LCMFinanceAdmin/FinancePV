// Who must sign a voucher, when it counts as signed, and marking it paid.
import test from "node:test";
import assert from "node:assert/strict";
import { pvWorld, resetPv } from "./helpers/pv-world.ts";

let adminHandler: ((req: unknown) => Promise<Response>) | null = null;
let signatoryHandler: ((req: unknown) => Promise<Response>) | null = null;
let capture: ((h: (req: unknown) => Promise<Response>) => void) | null = null;
(globalThis as unknown as { Deno: unknown }).Deno = {
  serve: (h: (req: unknown) => Promise<Response>) => { capture?.(h); },
  env: { get: () => "stub" },
};

// Through variables, so Deno source stays out of this directory's type graph.
const SHARED = "@/supabase/functions/_shared/supabase.ts";
const ADMIN_ACTION = "@/supabase/functions/admin-action/index.ts";
const SIGNATORY_ACTION = "@/supabase/functions/signatory-action/index.ts";

const { getLOATier, signatoryPlan, isSignatoryApprovalFinal } = await import(SHARED) as {
  getLOATier: (amount: number, paymentType?: string) => { required: number; roles: string[] };
  signatoryPlan: (amount: number, paymentType?: string, excludeRole?: string | null) => { required: number; roles: string[] };
  isSignatoryApprovalFinal: (
    approvals: { role: string; action: string }[],
    amount: number, paymentType?: string, excludeRole?: string | null,
  ) => boolean;
};

capture = (h) => { adminHandler = h; };
await import(ADMIN_ACTION);
capture = (h) => { signatoryHandler = h; };
await import(SIGNATORY_ACTION);

// ── How many signatures, and whose ───────────────────────────────────────

test("the amount decides how many officers must sign", () => {
  assert.deepEqual(getLOATier(30000), { required: 1, roles: ["TREASURER"] });
  assert.equal(getLOATier(30000.01).required, 2, "above RM 30,000 it takes two");
  assert.equal(getLOATier(250000, "ASSET_PURCHASE").required, 2);
});

test("nobody signs their own payment, whatever the amount", () => {
  // Below RM 30,000 the Treasurer is normally the only signature. When the
  // money is going to the Treasurer he is not a signature at all, so the other
  // two must both sign — the same rule of two independent officers, applied
  // honestly.
  const plan = signatoryPlan(1000, "GENERAL", "TREASURER");
  assert.equal(plan.required, 2);
  assert.deepEqual(plan.roles, ["BISHOP", "SECRETARY"]);
  assert.ok(!plan.roles.includes("TREASURER"));
});

test("an office that is not a signatory changes nothing", () => {
  assert.deepEqual(signatoryPlan(1000, "GENERAL", "GENERAL_MANAGER"), getLOATier(1000));
  assert.deepEqual(signatoryPlan(1000, "GENERAL", null), getLOATier(1000));
});

test("a small voucher is settled by the Treasurer alone", () => {
  const byTreasurer = [{ role: "TREASURER", action: "APPROVED" }];
  assert.equal(isSignatoryApprovalFinal(byTreasurer, 1000), true);
  assert.equal(isSignatoryApprovalFinal([{ role: "BISHOP", action: "APPROVED" }], 1000), false,
    "the Bishop is not the Treasurer");
});

test("a large one takes two different officers", () => {
  const one = [{ role: "BISHOP", action: "APPROVED" }];
  assert.equal(isSignatoryApprovalFinal(one, 50000), false);
  assert.equal(isSignatoryApprovalFinal(
    [...one, { role: "SECRETARY", action: "APPROVED" }], 50000), true);
});

test("one officer signing twice is not two approvals", () => {
  const twice = [
    { role: "BISHOP", action: "APPROVED" },
    { role: "BISHOP", action: "APPROVED" },
  ];
  assert.equal(isSignatoryApprovalFinal(twice, 50000), false);
});

test("a rejection is not an approval", () => {
  assert.equal(isSignatoryApprovalFinal([{ role: "TREASURER", action: "REJECTED" }], 1000), false);
});

// ── Through the handlers ─────────────────────────────────────────────────

const FINANCE   = { email: "finance@lcm", full_name: "Jermaine Aaron", role: "FINANCE_ADMIN" };
const ACCOUNTS  = { email: "accounts@lcm", full_name: "Liew Kim Fung", role: "FINANCE_ADMIN_2" };
const TREASURER = { email: "treasurer@lcm", full_name: "The Treasurer", role: "TREASURER", has_pin: false };
const STAFF     = { email: "staff@lcm", full_name: "Someone", role: "STAFF" };

function voucher(over: Record<string, unknown> = {}) {
  resetPv();
  pvWorld.tables = {
    user_roles: [FINANCE, ACCOUNTS, TREASURER, STAFF],
    pvs: [{
      id: "pv1", pv_no: "LCM-TEST-001", pv_type: "LCM", status: "APPROVED",
      amount: 2500, payee_name: "A Supplier", ministry: "Orang Asli",
      approvals: [], submitted_by_email: STAFF.email, applicant_email: STAFF.email,
      loa_required: 1, ...over,
    }],
  };
}
const pv = () => pvWorld.tables.pvs[0] as Record<string, unknown>;

async function call(
  handler: ((req: unknown) => Promise<Response>) | null,
  as: { email: string }, action: string, extra: Record<string, unknown> = {},
) {
  pvWorld.user = { email: as.email };
  const res = await handler!({
    method: "POST", headers: { get: () => "Bearer stub" },
    json: async () => ({ pv_id: "pv1", action, ...extra }),
  });
  return { status: res.status, body: await res.json() };
}

test("an officer cannot sign without their approval PIN", async () => {
  // A six-digit PIN is the second factor on a payment. Asking for it in the
  // browser only would make it decoration.
  voucher({ status: "PENDING_SIGNATORY" });
  const r = await call(signatoryHandler, TREASURER, "APPROVED");
  assert.equal(r.status, 400);
  assert.match(String(r.body.error), /PIN/);
});

test("nor with a PIN when none has been set for them", async () => {
  voucher({ status: "PENDING_SIGNATORY" });
  const r = await call(signatoryHandler, TREASURER, "APPROVED", { pin: "123456" });
  assert.equal(r.status, 403);
  assert.match(String(r.body.error), /No approval PIN set/);
});

test("a voucher is marked paid only once it has been approved", async () => {
  voucher({ status: "PENDING_SIGNATORY" });
  const early = await call(adminHandler, FINANCE, "MARK_PAID");
  assert.equal(early.status, 400);
  assert.match(String(early.body.error), /approved/);
  assert.equal(pv().status, "PENDING_SIGNATORY", "untouched");
});

test("marking paid records who paid it, when and by what reference", async () => {
  voucher({ status: "APPROVED" });
  const r = await call(adminHandler, FINANCE, "MARK_PAID", {
    payment_ref: "TRF-0099", payment_date: "2026-09-28", payment_method: "JomPAY",
  });
  assert.equal(r.status, 200);
  assert.equal(pv().status, "PAID");
  assert.equal(pv().paid_by, "Jermaine Aaron");
  assert.equal(pv().payment_ref, "TRF-0099");
  assert.equal(pv().payment_date, "2026-09-28");
  assert.ok(pv().paid_at);
  assert.ok(pvWorld.notifications.some(n => n.type === "PV_PAID"),
    "and the person who raised it is told");
});

test("the Accounts Executive records the payment, which is her job", async () => {
  // The other half of the rule that stops her reviewing: two jobs, not one.
  voucher({ status: "APPROVED" });
  const r = await call(adminHandler, ACCOUNTS, "MARK_PAID", { payment_ref: "TRF-0100" });
  assert.equal(r.status, 200);
  assert.equal(pv().status, "PAID");
  assert.equal(pv().paid_by, "Liew Kim Fung");
});

test("somebody outside Finance cannot mark a voucher paid", async () => {
  voucher({ status: "APPROVED" });
  const r = await call(adminHandler, STAFF, "MARK_PAID");
  assert.equal(r.status, 403);
  assert.equal(pv().status, "APPROVED");
});
