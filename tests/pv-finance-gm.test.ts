// Finance review, and the General Manager's approval after it.
//
// The two gates between a verified voucher and the signatories. Both handlers
// are run as they are: supabase/functions/admin-action/index.ts and
// supabase/functions/signatory-action/index.ts.
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

// Each function calls Deno.serve as it loads, so they are taken one at a time.
// Through variables, so TypeScript does not pull Deno source into this
// directory's type graph — see tests/pv-checker.test.ts.
const ADMIN_ACTION = "@/supabase/functions/admin-action/index.ts";
const SIGNATORY_ACTION = "@/supabase/functions/signatory-action/index.ts";
capture = (h) => { adminHandler = h; };
await import(ADMIN_ACTION);
capture = (h) => { signatoryHandler = h; };
await import(SIGNATORY_ACTION);

const FINANCE  = { email: "finance@lcm", full_name: "Jermaine Aaron", role: "FINANCE_ADMIN" };
const ACCOUNTS = { email: "accounts@lcm", full_name: "Liew Kim Fung", role: "FINANCE_ADMIN_2" };
const GM       = { email: "gm@lcm", full_name: "Jeffrey Koit", role: "GENERAL_MANAGER" };
const STAFF    = { email: "staff@lcm", full_name: "Someone", role: "STAFF" };

function voucher(over: Record<string, unknown> = {}) {
  resetPv();
  pvWorld.tables = {
    user_roles: [FINANCE, ACCOUNTS, GM, STAFF],
    pvs: [{
      id: "pv1", pv_no: "LCM-TEST-001", pv_type: "LCM", status: "PENDING",
      amount: 2500, payee_name: "A Supplier", payee_email: "supplier@example.com",
      ministry: "Orang Asli", project: "Camp", approvals: [],
      submitted_by_email: STAFF.email, loa_required: 1,
      ...over,
    }],
    notifications: [],
    user_security_credentials: [],
  };
}
const pv = () => pvWorld.tables.pvs[0] as Record<string, unknown>;
const approvals = () => (pv().approvals ?? []) as Record<string, unknown>[];

async function admin(as: { email: string }, action: string, extra: Record<string, unknown> = {}) {
  pvWorld.user = { email: as.email };
  const res = await adminHandler!({
    method: "POST", headers: { get: () => "Bearer stub" },
    json: async () => ({ pv_id: "pv1", action, ...extra }),
  });
  return { status: res.status, body: await res.json() };
}

async function signatory(as: { email: string }, action: string, extra: Record<string, unknown> = {}) {
  pvWorld.user = { email: as.email };
  const res = await signatoryHandler!({
    method: "POST", headers: { get: () => "Bearer stub" },
    json: async () => ({ pv_id: "pv1", action, ...extra }),
  });
  return { status: res.status, body: await res.json() };
}

// ── Finance review ───────────────────────────────────────────────────────

test("Finance review moves a pending voucher on and records who did it", async () => {
  voucher();
  const r = await admin(FINANCE, "REVIEW");
  assert.equal(r.status, 200);
  assert.equal(pv().status, "REVIEWED");
  assert.equal(pv().finance_verified_by, "Jermaine Aaron");
  assert.ok(pv().finance_verified_at);
  assert.ok(approvals().some(a => a.role === "FINANCE_ADMIN" && a.action === "APPROVED"));
  assert.ok(pvWorld.push.some(p => p.to.includes("GENERAL_MANAGER")),
    "the General Manager is told it is waiting on him");
});

test("the Accounts Executive records payments; she does not review vouchers", async () => {
  // Two jobs, not one. Hiding the button in the browser was never the control
  // — this is where the rule holds.
  voucher();
  const r = await admin(ACCOUNTS, "REVIEW");
  assert.equal(r.status, 403);
  assert.match(String(r.body.error), /Finance Executive/);
  assert.equal(pv().status, "PENDING", "untouched");
});

test("somebody outside Finance cannot review at all", async () => {
  voucher();
  const r = await admin(STAFF, "REVIEW");
  assert.equal(r.status, 403);
  assert.equal(pv().status, "PENDING");
});

test("a voucher that is not pending cannot be reviewed", async () => {
  voucher({ status: "REVIEWED" });
  const r = await admin(FINANCE, "REVIEW");
  assert.equal(r.status, 400);
});

// ── The gate to the signatories ──────────────────────────────────────────

test("a voucher cannot reach the signatories before the General Manager has approved", async () => {
  voucher({ status: "REVIEWED" });
  const r = await admin(FINANCE, "SEND_TO_SIGNATORY");
  assert.equal(r.status, 400);
  assert.match(String(r.body.error), /General Manager/);
  assert.equal(pv().status, "REVIEWED", "it stays where it was");
});

test("once he has, Finance may send it on", async () => {
  voucher({
    status: "REVIEWED",
    approvals: [{ role: "GENERAL_MANAGER", email: GM.email, name: GM.full_name, action: "APPROVED", timestamp: "2026-01-01T00:00:00Z" }],
  });
  const r = await admin(FINANCE, "SEND_TO_SIGNATORY");
  assert.equal(r.status, 200);
  assert.equal(pv().status, "PENDING_SIGNATORY");
});

// ── Who may not sign ─────────────────────────────────────────────────────

test("a voucher you claimed is not yours to approve", async () => {
  // The stage checked the role, the status, the PIN and whether this office
  // had already signed — never whether the signer was the person being paid.
  voucher({ status: "PENDING_SIGNATORY", applicant_email: GM.email });
  const r = await signatory(GM, "APPROVED");
  assert.equal(r.status, 403);
  assert.match(String(r.body.error), /pays you/);
});

test("nor one you submitted", async () => {
  voucher({ status: "PENDING_SIGNATORY", submitted_by_email: GM.email });
  const r = await signatory(GM, "APPROVED");
  assert.equal(r.status, 403);
});

test("the guard reads who claimed it, not the payee name", async () => {
  // Worth knowing which question is being asked. A voucher naming the General
  // Manager as payee, raised by Finance, is not caught by this rule — it is
  // not a claim he made. Whether it should be is a decision about the rule,
  // not a fault in it, and writing it down is how that decision gets made
  // deliberately rather than discovered.
  voucher({ status: "PENDING_SIGNATORY", payee_email: GM.email, payee_name: "Jeffrey Koit",
            applicant_email: "finance@lcm", submitted_by_email: "finance@lcm" });
  const r = await signatory(GM, "APPROVED");
  assert.notEqual(r.status, 403, "not refused as a beneficiary");
});
