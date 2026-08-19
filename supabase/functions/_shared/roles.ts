// EXCO seats, as one family.
//
// Migration 138 gave each portfolio its own role — EXCO_EDUCATION, EXCO_MISSION
// and so on — so the app can say what somebody actually holds instead of "EXCO
// Member" eight times over. The generic MINISTRY_HEAD stays valid for a seat
// whose portfolio has not been recorded yet.
//
// Everything that used to compare against "MINISTRY_HEAD" asks isExcoRole()
// instead. One definition, so adding a ninth portfolio cannot silently miss a
// call site and leave somebody holding a role that looks privileged and is not.
//
// Mirrors isExcoRole() in lib/utils.ts and is_exco_role() in SQL. Edge functions
// cannot import from the app, so this is a deliberate third copy — if one
// changes, all three must.

export function isExcoRole(role?: string | null): boolean {
  return role === "MINISTRY_HEAD" || (role?.startsWith("EXCO_") ?? false);
}

/**
 * The role an EXCO verification is RECORDED as, whoever gave it.
 *
 * Deliberately not the holder's own key. A voucher records that the ministry's
 * EXCO member verified it — the kind of approval, which has not changed — while
 * the directory records which portfolio that person holds. Keeping the recorded
 * key fixed also keeps saved signatures working: they are stored under the role
 * key, so somebody moving from MINISTRY_HEAD to EXCO_EDUCATION would otherwise
 * find their own signature missing.
 */
export const EXCO_APPROVAL_ROLE = "MINISTRY_HEAD";

/** PostgREST filter matching every EXCO seat, for `.or(...)`. */
export const EXCO_ROLE_FILTER = "role.eq.MINISTRY_HEAD,role.like.EXCO\_*";
