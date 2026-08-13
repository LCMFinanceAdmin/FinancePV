-- 114: Verifying on an EXCO member's behalf.
--
-- Only the holder of a portfolio can verify their ministry's spending, which
-- is right — the money is theirs to answer for. It is also why vouchers sit:
-- one person travelling, ill or simply busy stops an entire ministry's
-- payments, and the only ways round it today are to hand over a password or to
-- move the portfolio.
--
-- So a portfolio holder can name someone to verify for them. Two shapes,
-- because both happen: a person (the ministry's treasurer, an assistant), or a
-- committee, where any current member may act. And two scopes: everything the
-- ministry spends, or only named budget lines — a building project has its own
-- committee and its own money, and letting them clear that without seeing the
-- rest of the ministry's is the point.
--
-- What this is not is a transfer. The portfolio holder keeps their own right
-- to verify, keeps the ability to withdraw the delegation, and the voucher
-- records who actually signed it.

CREATE TABLE IF NOT EXISTS ministry_verifiers (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Matched against pvs.ministry, the same way the EXCO check already is.
  ministry   TEXT NOT NULL,

  -- Exactly one of these. A person acts as themselves; on a committee, any
  -- member holding an open term may act.
  person_id  UUID REFERENCES people(id)  ON DELETE CASCADE,
  office_id  UUID REFERENCES offices(id) ON DELETE CASCADE,

  -- Empty means the whole ministry. Otherwise the budget lines they cover,
  -- matched against pvs.project — which is what a voucher actually carries.
  projects   TEXT[] NOT NULL DEFAULT '{}',

  -- Who delegated, and why. A delegation is an act by a named person and
  -- should read like one a year later.
  granted_by TEXT,
  note       TEXT,

  -- A delegation for a season ends by itself. Null is open-ended.
  starts_on  DATE,
  ends_on    DATE,

  active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT one_delegate CHECK (
    (person_id IS NOT NULL AND office_id IS NULL) OR
    (person_id IS NULL AND office_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_mv_ministry ON ministry_verifiers (lower(ministry)) WHERE active;
CREATE INDEX IF NOT EXISTS idx_mv_person   ON ministry_verifiers (person_id) WHERE active;
CREATE INDEX IF NOT EXISTS idx_mv_office   ON ministry_verifiers (office_id) WHERE active;

-- ── May this person verify this voucher? ──────────────────────────────────
-- One answer, used by the queue, the page and the edge function, so what is
-- listed as actionable and what is actually accepted cannot drift apart.
--
-- Deliberately does NOT include the portfolio holder's own right: that is
-- checked from user_roles.ministries where it always has been, and folding two
-- different questions into one function makes neither answerable.
CREATE OR REPLACE FUNCTION is_delegated_verifier(
  p_email    TEXT,
  p_ministry TEXT,
  p_project  TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM ministry_verifiers v
      LEFT JOIN people p        ON p.id = v.person_id
      LEFT JOIN office_holdings h ON h.office_id = v.office_id AND h.term_end IS NULL
      LEFT JOIN people cp       ON cp.id = h.person_id
     WHERE v.active
       AND lower(v.ministry) = lower(p_ministry)
       AND (v.starts_on IS NULL OR v.starts_on <= CURRENT_DATE)
       AND (v.ends_on   IS NULL OR v.ends_on   >= CURRENT_DATE)
       -- Whole ministry, or this particular budget line.
       AND (
         cardinality(v.projects) = 0
         OR COALESCE(p_project, '') = ANY (v.projects)
       )
       AND (
         lower(COALESCE(p.user_email, ''))  = lower(p_email)
         OR lower(COALESCE(cp.user_email, '')) = lower(p_email)
       )
  );
$$;

GRANT EXECUTE ON FUNCTION is_delegated_verifier(TEXT, TEXT, TEXT) TO authenticated;

-- ── What has been handed to me ────────────────────────────────────────────
-- The queue has to know what to list before it knows which voucher it is
-- looking at, so the same rule is also exposed the other way round: the
-- ministries and budget lines this person may act on. Derived from the same
-- table, so a delegation that has expired disappears from the queue rather
-- than showing work that would be refused on submission.
CREATE OR REPLACE FUNCTION my_verifier_scopes()
RETURNS TABLE (ministry TEXT, projects TEXT[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.ministry, v.projects
    FROM ministry_verifiers v
    LEFT JOIN people p          ON p.id = v.person_id
    LEFT JOIN office_holdings h ON h.office_id = v.office_id AND h.term_end IS NULL
    LEFT JOIN people cp         ON cp.id = h.person_id
   WHERE v.active
     AND (v.starts_on IS NULL OR v.starts_on <= CURRENT_DATE)
     AND (v.ends_on   IS NULL OR v.ends_on   >= CURRENT_DATE)
     AND (
       lower(COALESCE(p.user_email, ''))  = lower(auth.jwt() ->> 'email')
       OR lower(COALESCE(cp.user_email, '')) = lower(auth.jwt() ->> 'email')
     );
$$;

GRANT EXECUTE ON FUNCTION my_verifier_scopes() TO authenticated;

-- ── Who may delegate ──────────────────────────────────────────────────────
-- The holder of the portfolio, and Finance, who has to be able to unpick a
-- delegation made by somebody who has since left.
CREATE OR REPLACE FUNCTION can_manage_ministry_verifiers(p_ministry TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND (
         ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3','GENERAL_MANAGER')
         OR lower(p_ministry) = ANY (SELECT lower(unnest(ur.ministries)))
       )
  );
$$;

GRANT EXECUTE ON FUNCTION can_manage_ministry_verifiers(TEXT) TO authenticated;

ALTER TABLE ministry_verifiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mv_read"  ON ministry_verifiers;
DROP POLICY IF EXISTS "mv_write" ON ministry_verifiers;

-- Readable by anyone signed in: a delegate has to be able to see that they
-- have been named, and a voucher's route should be explainable.
CREATE POLICY "mv_read" ON ministry_verifiers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "mv_write" ON ministry_verifiers
  FOR ALL TO authenticated
  USING (can_manage_ministry_verifiers(ministry))
  WITH CHECK (can_manage_ministry_verifiers(ministry));

GRANT SELECT, INSERT, UPDATE, DELETE ON ministry_verifiers TO authenticated;

COMMENT ON TABLE ministry_verifiers IS
  'Who may verify a ministry''s vouchers besides the portfolio holder — a person or a committee, for all of it or for named budget lines';
COMMENT ON COLUMN ministry_verifiers.projects IS
  'Empty for the whole ministry; otherwise the budget lines covered, matched against pvs.project';
