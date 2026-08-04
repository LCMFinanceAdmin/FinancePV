// Ministry structure for EXCO verification.
//
// Two ideas live here:
//
//  1. Not every row in the ministries lookup is a standing committee with a
//     head who verifies expenses. Those entries are payee groupings, offices or
//     other roles, so they can't be assigned to an EXCO Member.
//
//  2. Some committees have sub-ministries, and authority runs BOTH ways across
//     that link: the Education Desk representative verifies Education's
//     spending (that is where it is booked), and whoever holds Education also
//     covers Education Desk. In practice they are one committee.

const NON_EXCO_MINISTRIES = [
  "building asset management (bam)", // has its own chain via the Building/Event Manager
  "lcm congregation",                // a payee grouping, not a committee
  "bishop",                          // an office, not a committee
  "finance and development (f&d)",   // finance function, not a spending committee
  "hq",                              // administrative grouping
];

/** Sub-ministry → the committee it rolls up into. */
const MINISTRY_PARENTS: { child: string; parent: string }[] = [
  { child: "Education Desk", parent: "Education" },
];

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/**
 * Every ministry connected to `m` through the parent/child links, in either
 * direction. Iterates to a fixed point so a future chain (sub-sub-ministry)
 * resolves too.
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

/** Ministries an EXCO Member can be assigned to. */
export function excoAssignableMinistries(all: string[]): string[] {
  return all.filter(m => !NON_EXCO_MINISTRIES.includes(norm(m)));
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
 * The reverse view: which assigned-ministry values grant authority over a
 * transaction booked to `ministry` — used to decide who to notify. Symmetric
 * with expandMinistries, since the link works in both directions.
 */
export function coveringMinistries(ministry: string): string[] {
  return family(ministry);
}
