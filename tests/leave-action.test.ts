// The leave application walked end to end through the real route handler.
//
// The handler is the one the site runs. Only the three modules that reach
// outside the process are stood in for — see tests/helpers.
import test from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/leave-action/route";
import { world, reset } from "./helpers/world.ts";

const APPLICANT = { email: "finance@lcm.org.my", full_name: "Jermaine Aaron", role: "FINANCE_ADMIN" };
const GM        = { email: "gm@lcm.org.my", full_name: "Jeffrey Koit", role: "GENERAL_MANAGER" };
const BISHOP    = { email: "bishop@lcm.org.my", full_name: "Bishop Thomas", role: "BISHOP" };
const TREASURER = { email: "treasurer@lcm.org.my", full_name: "The Treasurer", role: "TREASURER" };

function application(extraRoles: Record<string, unknown>[] = []) {
  reset();
  world.roles = [APPLICANT, GM, BISHOP, ...extraRoles];
  world.leave = {
    id: "lv1", leave_no: "LV-TEST-001", status: "PENDING",
    applicant_email: APPLICANT.email, applicant_name: APPLICANT.full_name,
    start_date: "2026-10-07", end_date: "2026-10-09", days: 3,
    required_approvers: [
      { email: GM.email, name: GM.full_name, position: "General Manager", step: 1 },
      { email: BISHOP.email, name: BISHOP.full_name, position: "Bishop", step: 2 },
    ],
    approvals: [],
  };
}

type Res = { status: number; body: Record<string, unknown> };
const act = async (as: { email: string }, action: string, remarks?: string): Promise<Res> => {
  world.user = { email: as.email };
  return POST({ json: async () => ({ leave_id: "lv1", action, remarks }) } as never) as unknown as Res;
};
const leave = () => world.leave as Record<string, unknown>;
const approvals = () => leave().approvals as Record<string, unknown>[];
const mailedTo = () => world.mail.flatMap(m => m.to);

test("the chain is signed in order, and everyone is told in turn", async () => {
  application();

  const early = await act(BISHOP, "APPROVED");
  assert.equal(early.status, 409, "the Bishop cannot sign before the General Manager");
  assert.match(String(early.body.error), /Jeffrey Koit/, "and is told who it is with");
  assert.equal(leave().status, "PENDING");

  world.mail = [];
  const byGm = await act(GM, "APPROVED", "Fine by me");
  assert.equal(byGm.status, 200);
  assert.equal(leave().status, "PENDING", "one of two signatures does not grant it");
  assert.equal(approvals()[0].position, "General Manager", "recorded under the office");
  assert.ok(mailedTo().includes(APPLICANT.email), "the applicant is told");
  assert.ok(mailedTo().includes(BISHOP.email), "and the Bishop, whose turn it now is");

  world.mail = [];
  const byBishop = await act(BISHOP, "APPROVED");
  assert.equal(byBishop.status, 200);
  assert.equal(leave().status, "APPROVED");
  assert.equal(approvals().length, 2);
  assert.ok(world.mail.some(m => m.type === "LEAVE_APPROVED"));
});

test("nobody decides their own leave", async () => {
  application();
  // Finance Executive is a senior role, which is how this was reachable.
  const r = await act(APPLICANT, "APPROVED");
  assert.equal(r.status, 403);
  assert.equal(approvals().length, 0);
  assert.equal(leave().status, "PENDING");
});

test("only the applicant withdraws", async () => {
  application();
  assert.equal((await act(GM, "CANCELLED")).status, 403);
  assert.equal((await act(APPLICANT, "CANCELLED")).status, 200);
  assert.equal(leave().status, "CANCELLED");
});

test("a refusal ends it, from any step", async () => {
  application();
  assert.equal((await act(GM, "REJECTED", "Clashes with the audit")).status, 200);
  assert.equal(leave().status, "REJECTED");

  // Out of turn too: a refusal further up the chain is still a refusal, and
  // holding it back would only delay the applicant.
  application();
  assert.equal((await act(BISHOP, "REJECTED", "No")).status, 200);
  assert.equal(leave().status, "REJECTED");
});

test("signing twice does not make a second signature", async () => {
  application();
  await act(GM, "APPROVED");
  await act(GM, "APPROVED");
  assert.equal(approvals().length, 1);
  assert.equal(leave().status, "PENDING");
});

test("a successor answers the slot their predecessor was named in", async () => {
  // Posts change hands. Without this an application is stranded the moment a
  // General Manager or Bishop changes, with the outgoing officer the only one
  // who could clear it.
  const NEW_GM = { email: "newgm@lcm.org.my", full_name: "A New GM", role: "GENERAL_MANAGER" };
  application([NEW_GM]);
  const r = await act(NEW_GM, "APPROVED");
  assert.equal(r.status, 200);
  assert.equal(approvals()[0].name, "A New GM", "attributed to whoever actually signed");
  assert.equal(approvals()[0].for_email, GM.email, "against the slot it answers");
});

test("an application already settled cannot be decided again", async () => {
  application();
  leave().status = "APPROVED";
  assert.equal((await act(GM, "APPROVED")).status, 400);
});

test("somebody with no standing is refused", async () => {
  application([{ email: "nobody@lcm.org.my", full_name: "Nobody", role: "STAFF" }]);
  assert.equal((await act({ email: "nobody@lcm.org.my" }, "APPROVED")).status, 403);
});

test("a senior who is on no chain still settles it outright", async () => {
  // Deliberate and long-standing: leave should not be stuck when an approver
  // is unreachable. Recorded here because it is a real bypass of the order —
  // if that is ever narrowed, this test is the one that should fail first.
  application([TREASURER]);
  const r = await act(TREASURER, "APPROVED");
  assert.equal(r.status, 200);
  assert.equal(leave().status, "APPROVED", "granted without the GM or the Bishop signing");
  assert.equal(approvals().length, 1);
});
