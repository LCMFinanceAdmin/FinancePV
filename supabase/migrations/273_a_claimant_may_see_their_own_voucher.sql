-- 273: the person a voucher pays may read that voucher.
--
-- Until now a non-Finance account could read a row in `pvs` on two grounds:
-- they submitted it (066), or it is booked to a ministry of theirs (231). A
-- claim voucher is submitted by Finance, so the first never applies to the
-- claimant — and the second is an accident of whether the claimant happens to
-- sit on the committee the expense was booked to.
--
-- The effect was that "Share" in GM Claims copies a link to /my-pvs/<id> and
-- hands it to the claimant, and whether that link shows them anything or an
-- empty page depends on their ministry list. Joel Liew carries Young Adults &
-- Youth, so his works. A pastor claiming petrol against Mission sees nothing,
-- and there is no way for him to tell that from the voucher not existing.
--
-- This adds the obvious third ground: the voucher is for your claim.
--
-- SECURITY IMPACT — read it before approving:
--
--   * Grants SELECT on a `pvs` row to the email named as claimant on a
--     gm_claims row linked to it, or as submitter of a purchase_requests row
--     linked to it. One voucher, to one person, and only the voucher their own
--     claim became. It grants nothing else: no UPDATE, no DELETE, no listing
--     of other vouchers, and acting on a voucher still goes through the edge
--     functions, which check roles of their own.
--
--   * What they gain sight of, beyond the amount and purpose they already
--     know: the payee's bank name and account number, the approval trail with
--     the signatories' names and dates, the budget line it was charged to, and
--     the bank slip. For an ordinary claim the payee is the claimant, so the
--     bank details are their own. For a purchase-order claim the payee is the
--     supplier — a claimant who raised the order will usually have supplied
--     those details themselves, but not always, and this is the one place the
--     widening is more than it first looks.
--
--   * Matching is on the email in the claim row, compared case-insensitively
--     to the signed-in caller's. A blank or absent claimant_email matches
--     nobody, and so does an unauthenticated caller — auth.jwt() is null
--     without a session, so the function fails closed.
--
-- Not applied to bulk payroll vouchers: an employee's own pay is reached
-- through My Salary, which is scoped to them and shows a payslip rather than a
-- voucher. Nothing here changes that.

CREATE OR REPLACE FUNCTION can_see_own_claim_pv(p_pv_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(lower(auth.jwt() ->> 'email'), '') <> '' AND (
    -- The claim the General Manager accepted, in your name.
    EXISTS (
      SELECT 1 FROM gm_claims c
       WHERE c.pv_id = p_pv_id
         AND lower(COALESCE(c.claimant_email, '')) = lower(auth.jwt() ->> 'email')
    )
    -- Or the payment request you raised, which became this voucher.
    OR EXISTS (
      SELECT 1 FROM purchase_requests pr
       WHERE pr.pv_id = p_pv_id
         AND lower(COALESCE(pr.submitted_by_email, '')) = lower(auth.jwt() ->> 'email')
    )
  );
$$;

-- Supabase grants EXECUTE to `anon` explicitly as well as to PUBLIC, so
-- revoking PUBLIC alone leaves the door open — migration 116 is the whole
-- story. The function fails closed for anon either way; this is the declared
-- intent actually holding.
REVOKE EXECUTE ON FUNCTION can_see_own_claim_pv(uuid) FROM PUBLIC, anon;

DROP POLICY IF EXISTS pvs_claimant_read ON pvs;
CREATE POLICY pvs_claimant_read ON pvs
  FOR SELECT
  TO authenticated
  USING (can_see_own_claim_pv(id));

COMMENT ON FUNCTION can_see_own_claim_pv(uuid) IS
  'May the caller see this voucher because it pays their own claim: named as '
  'claimant on a gm_claims row linked to it, or submitter of the '
  'purchase_requests row it was raised from. Read only.';
