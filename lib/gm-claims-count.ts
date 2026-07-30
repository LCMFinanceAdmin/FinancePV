import type { SupabaseClient } from "@supabase/supabase-js";

// How many GM claims still need the Finance Executive's attention — i.e. their
// linked PV isn't PAID yet, or no PV has been created at all. Used for the
// inbox-style badge on the "GM Claims" nav item and the dashboard highlight, so
// a new or still-in-progress claim is visible without opening the page.
export async function fetchUnprocessedGmClaimCount(supabase: SupabaseClient): Promise<number> {
  const { data: claims } = await supabase.from("gm_claims").select("id,pv_id");
  if (!claims) return 0;
  const pvIds = claims.map((c: { pv_id: string | null }) => c.pv_id).filter(Boolean) as string[];
  let paid = new Set<string>();
  if (pvIds.length) {
    const { data: pvs } = await supabase.from("pvs").select("id").in("id", pvIds).eq("status", "PAID");
    paid = new Set((pvs ?? []).map((p: { id: string }) => p.id));
  }
  return claims.filter((c: { pv_id: string | null }) => !c.pv_id || !paid.has(c.pv_id)).length;
}
