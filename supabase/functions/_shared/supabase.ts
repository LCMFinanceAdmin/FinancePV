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
  columns = "role,full_name,saved_signature",
) {
  const { data } = await db.from("user_roles").select(columns).eq("email", email).limit(1);
  return data?.[0] ?? null;
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
  return officerApprovals.length >= 2;
  // ───────────────────────────────────────────────────────────────────
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
