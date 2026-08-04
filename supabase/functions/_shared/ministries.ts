// Ministry structure for EXCO verification.
//
// Mirrors lib/ministries.ts — edge functions can't import from the Next.js app,
// so the sub-ministry links are declared in both places. Keep them in step.
//
// A member assigned to a sub-ministry also acts for its parent committee: the
// Education Desk representative verifies Education's transactions, since that
// is where the spending is booked.

const MINISTRY_PARENTS: { child: string; parent: string }[] = [
  { child: "Education Desk", parent: "Education" },
];

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/** A member's assigned ministries plus every parent they roll up into. */
export function expandMinistries(assigned: string[]): string[] {
  const out = new Set(assigned ?? []);
  for (const m of assigned ?? []) {
    for (const link of MINISTRY_PARENTS) {
      if (norm(link.child) === norm(m)) out.add(link.parent);
    }
  }
  return [...out];
}

/**
 * Which assigned-ministry values grant authority over a transaction booked to
 * `ministry`. A request against "Education" may be verified by someone
 * assigned "Education" or "Education Desk" — used to decide who to notify.
 */
export function coveringMinistries(ministry: string): string[] {
  const out = new Set([ministry]);
  for (const link of MINISTRY_PARENTS) {
    if (norm(link.parent) === norm(ministry)) out.add(link.child);
  }
  return [...out];
}
