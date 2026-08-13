// Verifying on an EXCO member's behalf — the client's half of it.
//
// The database decides whether a delegation is real (see migration 114); this
// only asks it, and answers the question the queue actually needs: given what
// has been handed to me, does *this* voucher belong in my list?
//
// The reason scope lives here rather than in a `.in("ministry", …)` filter is
// that a delegation can be narrower than a ministry. Someone given the building
// project should see the building project's vouchers and nothing else of
// Property's — filtering on ministry alone would show them the lot.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface VerifierScope {
  ministry: string;
  /** Empty means the whole ministry; otherwise the budget lines covered. */
  projects: string[];
}

/** What the signed-in person has been asked to verify for somebody else. */
export async function loadMyVerifierScopes(
  supabase: SupabaseClient,
): Promise<VerifierScope[]> {
  const { data, error } = await supabase.rpc("my_verifier_scopes");
  if (error) return [];
  return ((data ?? []) as { ministry: string; projects: string[] | null }[])
    .map(r => ({ ministry: r.ministry, projects: r.projects ?? [] }));
}

/**
 * Does a delegation cover this particular voucher or request?
 *
 * Kept separate from the fetch so the queue can filter rows it already has
 * rather than asking the server per row.
 */
export function coveredByScope(
  scopes: VerifierScope[],
  ministry: string | null | undefined,
  project: string | null | undefined,
): boolean {
  const m = (ministry ?? "").trim().toLowerCase();
  if (!m) return false;
  return scopes.some(s =>
    s.ministry.trim().toLowerCase() === m &&
    (s.projects.length === 0 || s.projects.includes(project ?? "")),
  );
}

/** Ministries to widen a query by — the coarse filter, narrowed afterwards. */
export function scopedMinistries(scopes: VerifierScope[]): string[] {
  return [...new Set(scopes.map(s => s.ministry))];
}

/** How a delegation reads in a sentence: "Youth" or "Youth — Camp 2026, Retreat". */
export function describeScope(s: VerifierScope): string {
  return s.projects.length === 0
    ? `${s.ministry} — everything`
    : `${s.ministry} — ${s.projects.join(", ")}`;
}
