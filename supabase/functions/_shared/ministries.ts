// Ministry structure for EXCO verification.
//
// Mirrors lib/ministries.ts — edge functions can't import from the Next.js app,
// so the sub-ministry links are declared in both places. Keep them in step.
//
// Authority runs BOTH ways across a parent/child link: the Education Desk
// representative verifies Education's spending (that is where it is booked),
// and whoever holds Education also covers Education Desk.

const MINISTRY_PARENTS: { child: string; parent: string }[] = [
  { child: "Education Desk", parent: "Education" },
];

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/**
 * Every ministry connected to `m` through the parent/child links, in either
 * direction. Iterates to a fixed point so a future chain resolves too.
 */
function family(m: string): string[] {
  const seen = [m];
  const has = (name: string) => seen.some(s => norm(s) === norm(name));
  let grew = true;
  while (grew) {
    grew = false;
    for (const link of MINISTRY_PARENTS) {
      if (has(link.child) && !has(link.parent)) { seen.push(link.parent); grew = true; }
      if (has(link.parent) && !has(link.child)) { seen.push(link.child); grew = true; }
    }
  }
  return seen;
}

/**
 * Everything a member may verify: their assigned ministries plus any linked
 * sub-ministry or parent committee.
 */
export function expandMinistries(assigned: string[]): string[] {
  const out = new Set<string>();
  for (const m of assigned ?? []) for (const f of family(m)) out.add(f);
  return [...out];
}

/**
 * Which assigned-ministry values grant authority over a transaction booked to
 * `ministry` — used to decide who to notify. Symmetric with expandMinistries,
 * since the link works in both directions.
 */
export function coveringMinistries(ministry: string): string[] {
  return family(ministry);
}
