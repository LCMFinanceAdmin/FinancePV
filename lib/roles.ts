// The app's roles, as the church has chosen to name them.
//
// The keys are still code — FINANCE_ADMIN and the rest are written into RLS
// policies and edge functions, and nothing here can change what one is allowed
// to do. What this owns is everything else: the label people read, the
// description that explains it, the order of the picker, and whether a role can
// be handed out at all.
//
// roleLabel() in lib/utils.ts stays the fallback and stays synchronous, because
// it is called from dozens of components that render before any fetch could
// finish. This layer overrides it once the table has loaded, so the worst case
// is a page briefly showing the built-in name rather than a renamed one — which
// is exactly what it showed before this existed.

import type { SupabaseClient } from "@supabase/supabase-js";
import { setRoleLabelOverrides } from "@/lib/utils";

export interface AppRole {
  key: string;
  label: string;
  description: string;
  assignable: boolean;
  is_system: boolean;
  sort_order: number;
}

let cache: AppRole[] | null = null;
let inflight: Promise<AppRole[]> | null = null;

/**
 * Every role, in picker order.
 *
 * Cached for the page's lifetime and de-duplicated while in flight — the role
 * list is rendered by several components at once and there is no reason for
 * each of them to fetch it.
 */
export async function loadRoles(supabase: SupabaseClient, force = false): Promise<AppRole[]> {
  if (cache && !force) return cache;
  if (inflight && !force) return inflight;

  inflight = (async () => {
    const { data, error } = await supabase
      .from("app_roles").select("*").order("sort_order");
    // An empty list would empty every picker, so a failure keeps whatever we
    // had and lets roleLabel fall back to the built-in names.
    if (error || !data?.length) return cache ?? [];
    const rows = data as AppRole[];
    cache = rows;
    setRoleLabelOverrides(Object.fromEntries(rows.map(r => [r.key, r.label])));
    return rows;
  })();

  try { return await inflight; } finally { inflight = null; }
}

/** Roles that may be handed out, plus whatever the person already holds. */
export function assignableRoles(roles: AppRole[], current?: string | null): AppRole[] {
  const out = roles.filter(r => r.assignable);
  // Somebody holding a retired role must still see it selected, or the picker
  // would silently misreport their access as the first option in the list.
  if (current && !out.some(r => r.key === current)) {
    const held = roles.find(r => r.key === current);
    if (held) out.push(held);
  }
  return out;
}
