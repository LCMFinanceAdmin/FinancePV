// Ministry structure for EXCO verification.
//
// Two ideas live here:
//
//  1. Not every row in the ministries lookup is a standing committee with a
//     head who verifies expenses. Those entries are payee groupings, offices or
//     other roles, so they can't be assigned to an EXCO Member.
//
//  2. Some committees have sub-ministries. A member assigned to a sub-ministry
//     also acts for its parent — the Education Desk representative verifies
//     Education's transactions, since that is where the spending is booked.

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

const norm = (s: string) => s.trim().toLowerCase();

/** Ministries an EXCO Member can be assigned to. */
export function excoAssignableMinistries(all: string[]): string[] {
  return all.filter(m => !NON_EXCO_MINISTRIES.includes(norm(m)));
}

/**
 * A member's assigned ministries plus every parent those roll up into, i.e.
 * everything they may verify. Assigning "Education Desk" also covers
 * "Education".
 */
export function expandMinistries(assigned: string[]): string[] {
  const out = new Set(assigned);
  for (const m of assigned) {
    for (const link of MINISTRY_PARENTS) {
      if (norm(link.child) === norm(m)) out.add(link.parent);
    }
  }
  return [...out];
}

/**
 * The reverse: which assigned-ministry values grant authority over a
 * transaction booked to `ministry`. A request against "Education" may be
 * verified by someone assigned "Education" or "Education Desk" — used to work
 * out who to notify.
 */
export function coveringMinistries(ministry: string): string[] {
  const out = new Set([ministry]);
  for (const link of MINISTRY_PARENTS) {
    if (norm(link.parent) === norm(ministry)) out.add(link.child);
  }
  return [...out];
}
