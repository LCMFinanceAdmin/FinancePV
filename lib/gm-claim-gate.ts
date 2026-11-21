// When Finance may raise a voucher against a GM claim.
//
// A claim that arrives from an EXCO-verified Payment Request lands at
// AWAITING_GM. The General Manager accepting it is the instruction to Finance
// to pay — that is what 085 set up and what the Accept button does — so until
// he accepts there is nothing for Finance to raise.
//
// Here, in one function, because the rule is read in four places: the Create
// PV button and the Link PV button in the claims table, the same pair on the
// card, and the submit page when it is opened with a claim_id. Written out
// four times it is four chances to disagree, and the one that disagrees is the
// one that lets a voucher through.
//
// This is the readable half of the rule. The half that holds is the database
// trigger in migration 272, which refuses to attach a pv_id to a claim still
// awaiting acceptance however the write arrives.

/** The claim fields this rule reads — nothing else about a claim matters. */
export interface ClaimAcceptance {
  gm_status?: "AWAITING_GM" | "ACCEPTED" | string | null;
}

/** True while the claim is still waiting on the General Manager. */
export function awaitsGm(claim: ClaimAcceptance): boolean {
  return claim.gm_status === "AWAITING_GM";
}

/** Whether Finance may raise or attach a voucher for this claim. */
export function canRaisePv(claim: ClaimAcceptance): boolean {
  return !awaitsGm(claim);
}

/** What to tell somebody who got here anyway. */
export function awaitingGmReason(claimNo?: string | null): string {
  return `Claim ${claimNo || "this claim"} has not been accepted by the General Manager yet. `
    + "He has to accept it in GM Claims before a voucher can be raised against it.";
}
