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
  return officerApprovals.length >= 2;
}

export async function nextPvNo(db: ReturnType<typeof getServiceClient>): Promise<string> {
  const year = new Date().getFullYear();
  const { count } = await db
    .from("pvs")
    .select("id", { count: "exact", head: true })
    .gte("submitted_at", `${year}-01-01`);
  const seq = String((count ?? 0) + 1).padStart(3, "0");
  return `LCM-${year}-${seq}`;
}
