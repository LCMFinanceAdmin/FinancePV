import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export function getServiceClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

export function getUserClient(jwt: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } } }
  );
}

// Tolerates duplicate user_roles rows for the same email — .single() errors
// and silently returns null in that case, which surfaces as a misleading 403.
export async function getProfileByEmail(
  db: ReturnType<typeof getServiceClient>,
  email: string,
  columns = "role,full_name",
) {
  const { data } = await db.from("user_roles").select(columns).eq("email", email).limit(1);
  const profile = data?.[0];
  if (!profile) return null;

  // PIN hashes and reusable signatures intentionally live outside the broadly
  // readable directory profile. This helper runs only in service-role actions.
  const { data: credentials } = await db
    .from("user_security_credentials")
    .select("pin_hash,has_pin,saved_signatures")
    .eq("email", email)
    .maybeSingle();

  return {
    ...profile,
    pin_hash: credentials?.pin_hash ?? null,
    has_pin: credentials?.has_pin ?? false,
    saved_signature: null,
    saved_signatures: credentials?.saved_signatures ?? {},
  };
}

export function getLOATier(amount: number, paymentType = "GENERAL") {
  if (paymentType === "ASSET_PURCHASE" && amount > 100000) {
    return { required: 2, roles: ["BISHOP", "SECRETARY", "TREASURER"] };
  }
  if (amount <= 30000) return { required: 1, roles: ["TREASURER"] };
  return { required: 2, roles: ["BISHOP", "SECRETARY", "TREASURER"] };
}

export function isSignatoryApprovalFinal(approvals: { role: string; action: string }[], amount: number, paymentType = "GENERAL") {
  const loa = getLOATier(amount, paymentType);
  const officerApprovals = approvals.filter(
    (a) => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
  );
  if (loa.required === 1) return officerApprovals.some((a) => a.role === "TREASURER");
  // ── TESTING MODE: count total approvals (not distinct roles) ────────
  // In production, change officerApprovals.length to use distinct roles:
  // const distinctRoles = new Set(officerApprovals.map(a => a.role)).size;
  // return distinctRoles >= 2;
  return new Set(officerApprovals.map((approval) => approval.role)).size >= 2;
  // ───────────────────────────────────────────────────────────────────
}


/**
 * Take a number released by a deleted cancelled voucher, if there is one.
 *
 * Reusing a freed number keeps the series unbroken, which is what an auditor
 * expects to see. Marking it reissued in the same step is what stops it being
 * handed to two vouchers — the check-then-use is deliberately narrow.
 */
async function takeReclaimedNo(db: ReturnType<typeof getServiceClient>, prefix: string): Promise<string | null> {
  const { data: free } = await db
    .from("pv_number_pool")
    .select("id,pv_no")
    .eq("prefix", prefix)
    .is("reissued_at", null)
    .order("pv_no", { ascending: true })
    .limit(1);

  const row = free?.[0];
  if (!row) return null;

  // Only claim it if it is still unclaimed at the moment of writing.
  const { data: claimed } = await db
    .from("pv_number_pool")
    .update({ reissued_at: new Date().toISOString() })
    .eq("id", row.id)
    .is("reissued_at", null)
    .select("pv_no");

  return claimed?.[0]?.pv_no ?? null;
}

export async function nextPrNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `PR-${year}-`;
  const { data } = await db
    .from("purchase_requests")
    .select("request_no")
    .like("request_no", `${prefix}%`)
    .order("request_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.request_no
    ? parseInt(data[0].request_no.replace(prefix, ""), 10)
    : 0;
  const seq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function nextPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LCM-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix.split("-")[0]);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  const seq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function nextBamPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `BAM-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix.split("-")[0]);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  const seq = String(lastSeq + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

export async function nextLscPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `LSC-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix.split("-")[0]);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}

export async function nextHlePvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `HLE-${year}-`;
  const reclaimed = await takeReclaimedNo(db, prefix.split("-")[0]);
  if (reclaimed) return reclaimed;
  const { data } = await db
    .from("pvs")
    .select("pv_no")
    .like("pv_no", `${prefix}%`)
    .order("pv_no", { ascending: false })
    .limit(1);
  const lastSeq = data?.[0]?.pv_no
    ? parseInt(data[0].pv_no.replace(prefix, ""), 10)
    : 0;
  return `${prefix}${String(lastSeq + 1).padStart(3, "0")}`;
}
