// Who may verify a ministry's spending.
//
// Two answers, and they are different questions: the portfolio holder holds the
// right because of what they were elected to, and a delegate holds it because
// the holder handed it over for this ministry — or for named budget lines
// within it. Both end in "yes, they may act", but only one of them should put
// "on behalf of" on the voucher, so the caller gets told which.
//
// Kept here rather than in each function because the PV path and the payment
// request path both ask it, and a delegate who can clear a request but not the
// voucher it becomes is worse than no delegation at all.

import { expandMinistries } from "./ministries.ts";

// deno-lint-ignore no-explicit-any
type Db = any;

export interface VerifyRight {
  /** May they act on this at all? */
  allowed: boolean;
  /** True when the right comes from a delegation rather than the portfolio. */
  delegated: boolean;
}

/**
 * @param ministries the actor's own portfolios, straight from user_roles
 * @param project    the budget line on the voucher or request, if it carries one
 */
export async function mayVerifyFor(
  db: Db,
  email: string,
  ministries: string[] | null,
  ministry: string,
  project?: string | null,
): Promise<VerifyRight> {
  // Sub-ministries and their parent count as one committee — the Education Desk
  // representative verifies what Education books.
  if (expandMinistries(ministries ?? []).includes(ministry)) {
    return { allowed: true, delegated: false };
  }

  const { data } = await db.rpc("is_delegated_verifier", {
    p_email: email,
    p_ministry: ministry,
    p_project: project ?? null,
  });
  return { allowed: data === true, delegated: data === true };
}
