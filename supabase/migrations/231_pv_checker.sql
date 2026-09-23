-- 231: somebody to check the figures, and eyes on the queue to do it with.
--
-- Three things, and the third is the reason the first two would not have
-- worked on their own.
--
-- 1. A standing appointment. An EXCO Member names one person for their
--    ministry, who checks that the particulars and amounts on a voucher are
--    right. That is a different question from the one the EXCO answers —
--    whether the church should pay at all — so it gets its own signature
--    rather than being folded into theirs.
--
-- 2. The record of a check on the voucher itself: who, when, and the
--    signature. Requesting it is the EXCO's call, per voucher, so the columns
--    stay empty for anything they were content to verify themselves.
--
-- 3. Read access. The pvs table had exactly three policies: Finance and
--    senior roles, BAM roles on BAM vouchers, and submitters on their own. An
--    EXCO Member had none — so the ministry queue, which asks for PVs at
--    PENDING_HEAD in their ministries, has always been able to return nothing
--    to them. It has gone unnoticed because no voucher has ever sat at that
--    status: every department row has an empty head_email, so submit-pv has
--    never routed one there. The moment it did, the queue would have been
--    empty and no error would have said why. A checker would have hit the
--    same wall on day one.

-- ── 1. The appointment ──────────────────────────────────────────────────────
ALTER TABLE ministries
  ADD COLUMN IF NOT EXISTS checker_email TEXT,
  ADD COLUMN IF NOT EXISTS checker_name  TEXT;

COMMENT ON COLUMN ministries.checker_email IS
  'The person the EXCO Member has appointed to check the particulars of this '
  'ministry''s vouchers. Empty means no appointment, and the EXCO verifies '
  'unaided.';

-- ── 2. The record of the check ──────────────────────────────────────────────
ALTER TABLE pvs
  ADD COLUMN IF NOT EXISTS checked_by_email       TEXT,
  ADD COLUMN IF NOT EXISTS checked_by_name        TEXT,
  ADD COLUMN IF NOT EXISTS checked_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checked_signature_data TEXT,
  ADD COLUMN IF NOT EXISTS check_requested_by     TEXT,
  ADD COLUMN IF NOT EXISTS check_requested_at     TIMESTAMPTZ;

COMMENT ON COLUMN pvs.checked_at IS
  'When the appointed checker confirmed the particulars. Null on a voucher the '
  'EXCO verified without asking for a check, which is theirs to decide each time.';

-- ── 3. Who may see a voucher ────────────────────────────────────────────────

-- An EXCO Member's own ministries, a delegation handed to them, or an
-- appointment to check for that ministry. SECURITY DEFINER because it reads
-- user_roles, which the caller cannot.
CREATE OR REPLACE FUNCTION can_see_ministry_pv(p_ministry TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(p_ministry, '') <> '' AND (
    -- Assigned to the ministry.
    EXISTS (
      SELECT 1 FROM user_roles ur
       WHERE ur.email = (auth.jwt() ->> 'email')
         AND lower(p_ministry) IN (SELECT lower(m) FROM unnest(COALESCE(ur.ministries, '{}')) AS m)
    )
    -- Or appointed to check for it.
    OR EXISTS (
      SELECT 1 FROM ministries m
       WHERE lower(m.name) = lower(p_ministry)
         AND lower(COALESCE(m.checker_email, '')) = lower(auth.jwt() ->> 'email')
    )
    -- Or holding a delegation that covers it. Delegations name a person_id
    -- rather than an address, and my_verifier_scopes() already does the work
    -- of turning the signed-in caller into their delegations — repeating that
    -- join here would be a second place to keep it right.
    OR EXISTS (
      SELECT 1 FROM my_verifier_scopes() s
       WHERE lower(s.ministry) = lower(p_ministry)
    )
  );
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default and Supabase's anon role
-- inherits it, so a SECURITY DEFINER function is readable by the world until
-- this line runs. Same reasoning as migration 212.
REVOKE EXECUTE ON FUNCTION can_see_ministry_pv(TEXT) FROM PUBLIC, anon;

DROP POLICY IF EXISTS pvs_ministry_read ON pvs;
CREATE POLICY pvs_ministry_read ON pvs
  FOR SELECT
  USING (can_see_ministry_pv(ministry));

COMMENT ON FUNCTION can_see_ministry_pv(TEXT) IS
  'May the caller see vouchers booked to this ministry: assigned to it, '
  'appointed to check for it, or holding a delegation over it. Read only — '
  'acting on a voucher still goes through the edge functions.';
