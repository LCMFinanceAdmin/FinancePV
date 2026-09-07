-- 194: the payroll knows who the employer is.
--
-- LCM is not the only employer in this building. The Trustees of the Lutheran
-- Church in Malaysia Registered employ people too, and 193 recorded two of them
-- without anywhere to pay them from. This adds the employer to payroll and to
-- entitlements, so a second payroll can be run without the two mixing.
--
-- Three things made that impossible rather than merely undone:
--
--   payroll_runs carried a UNIQUE index on (year, month). One August 2026, for
--   everybody. A second employer could not have a run at all.
--
--   The run page loads every payroll_employees row with no filter, so a
--   Trustees run would have paid LCM's 81 staff.
--
--   claim_entitlements and leave_entitlement_bands hold LCM's Terms and
--   Conditions with nothing saying so, so the first Trustees employee added
--   would have inherited LCM's book allowance and LCM's leave bands.
--
-- All three are structural. None would have announced itself; the third would
-- have looked like the system working.
--
-- ── Statutory identifiers belong to the employer ──────────────────────────
-- EPF, SOCSO and LHDN each register the employer, not the church as an idea.
-- Two employers means two employer numbers and two sets of monthly filings, so
-- those columns live here. payroll_statutory_rates is deliberately left alone —
-- the *rates* are national and identical for both, and duplicating them per
-- employer would invite them to drift apart for no reason.
--
-- ── Entitlements are not assumed to transfer ──────────────────────────────
-- entitlements_configured is false for the Trustees and stays false until
-- somebody enters their terms. Their staff are then paid, see their own
-- payslips, and are offered no leave or claim entitlement at all — rather than
-- silently offered LCM's, which are a different employer's contract and not
-- the church's to hand out on the Trustees' behalf.
--
-- That switch also future-proofs the gate: user_roles.is_lcm_staff becomes
-- "employed on a payroll whose entitlements are set up", which today evaluates
-- exactly as "on LCM payroll" because only LCM is configured, and will start
-- including Trustees staff the day their terms are entered — without anybody
-- having to remember this file.

-- ── The employers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payroll_employers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  short_name      TEXT,
  -- Optional link to the directory's organisations table, which already knows
  -- the Trustees. Nullable because LCM itself is not listed there: that table
  -- describes bodies LCM deals with.
  organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  -- One registration each, with the three agencies that register employers.
  employer_tax_ref TEXT,   -- LHDN E number
  epf_no           TEXT,
  socso_no         TEXT,
  -- Employee numbers are unique across the whole table, so each employer needs
  -- its own prefix or the two will collide at EMP-001.
  emp_no_prefix   TEXT NOT NULL DEFAULT 'EMP-',
  -- False until this employer's leave and claim terms have been entered.
  entitlements_configured BOOLEAN NOT NULL DEFAULT FALSE,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order      INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE payroll_employers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pemployer_read" ON payroll_employers;
CREATE POLICY "pemployer_read" ON payroll_employers
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pemployer_write" ON payroll_employers;
CREATE POLICY "pemployer_write" ON payroll_employers FOR ALL TO authenticated
  USING (can_manage_payroll()) WITH CHECK (can_manage_payroll());

INSERT INTO payroll_employers (code, name, short_name, emp_no_prefix,
                               entitlements_configured, sort_order)
VALUES ('LCM', 'Lutheran Church in Malaysia', 'LCM', 'EMP-', TRUE, 10)
ON CONFLICT (code) DO NOTHING;

INSERT INTO payroll_employers (code, name, short_name, organisation_id,
                               emp_no_prefix, entitlements_configured, sort_order)
SELECT 'TRUSTEES', o.name, 'LCM Trustees', o.id, 'TRU-', FALSE, 20
  FROM organisations o WHERE o.short_name = 'LCM Trustees'
ON CONFLICT (code) DO NOTHING;

-- DEFAULT cannot hold a subquery, so the lookup is a function. Kept STABLE and
-- deliberately not SECURITY DEFINER: it reads one id from a table everybody may
-- already read.
CREATE OR REPLACE FUNCTION default_payroll_employer()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$ SELECT id FROM payroll_employers WHERE code = 'LCM' $$;

-- ── Employees ─────────────────────────────────────────────────────────────
ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES payroll_employers(id);

UPDATE payroll_employees SET employer_id = (SELECT id FROM payroll_employers WHERE code='LCM')
 WHERE employer_id IS NULL;

ALTER TABLE payroll_employees ALTER COLUMN employer_id SET NOT NULL;
ALTER TABLE payroll_employees ALTER COLUMN employer_id
  SET DEFAULT default_payroll_employer();

CREATE INDEX IF NOT EXISTS idx_pe_employer ON payroll_employees (employer_id);

-- ── Runs ──────────────────────────────────────────────────────────────────
ALTER TABLE payroll_runs
  ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES payroll_employers(id);

UPDATE payroll_runs SET employer_id = (SELECT id FROM payroll_employers WHERE code='LCM')
 WHERE employer_id IS NULL;

ALTER TABLE payroll_runs ALTER COLUMN employer_id SET NOT NULL;
ALTER TABLE payroll_runs ALTER COLUMN employer_id
  SET DEFAULT default_payroll_employer();

-- One period per employer, rather than one period for the whole church.
DROP INDEX IF EXISTS idx_pr_period;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pr_employer_period
  ON payroll_runs (employer_id, year, month);

-- ── Entitlements belong to an employer's contract ─────────────────────────
ALTER TABLE claim_entitlements
  ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES payroll_employers(id);
UPDATE claim_entitlements SET employer_id = (SELECT id FROM payroll_employers WHERE code='LCM')
 WHERE employer_id IS NULL;
ALTER TABLE claim_entitlements ALTER COLUMN employer_id SET NOT NULL;
ALTER TABLE claim_entitlements ALTER COLUMN employer_id
  SET DEFAULT default_payroll_employer();

-- The uniqueness rules from 189 gain the employer, so both employers may hold
-- their own terms for the same claim and the same category.
DROP INDEX IF EXISTS claim_entitlement_by_category;
DROP INDEX IF EXISTS claim_entitlement_by_person;
CREATE UNIQUE INDEX IF NOT EXISTS claim_entitlement_by_category
  ON claim_entitlements (employer_id, claim_code, person_category) WHERE person_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS claim_entitlement_by_person
  ON claim_entitlements (employer_id, claim_code, person_id) WHERE person_id IS NOT NULL;

ALTER TABLE leave_entitlement_bands
  ADD COLUMN IF NOT EXISTS employer_id UUID REFERENCES payroll_employers(id);
UPDATE leave_entitlement_bands SET employer_id = (SELECT id FROM payroll_employers WHERE code='LCM')
 WHERE employer_id IS NULL;
ALTER TABLE leave_entitlement_bands ALTER COLUMN employer_id SET NOT NULL;
ALTER TABLE leave_entitlement_bands ALTER COLUMN employer_id
  SET DEFAULT default_payroll_employer();

-- ── Which employer is this person's ───────────────────────────────────────
CREATE OR REPLACE FUNCTION payroll_employer_for(p_email TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pe.employer_id
    FROM people p
    JOIN payroll_employees pe ON pe.person_id = p.id
   WHERE (lower(p.user_email) = lower(p_email)
       OR lower(COALESCE(p.work_email, '')) = lower(p_email))
     AND pe.status = 'ACTIVE'
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION payroll_employer_for(TEXT) TO authenticated;

-- Still means LCM specifically. Anything LCM-only should keep asking this.
CREATE OR REPLACE FUNCTION is_lcm_payroll(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT payroll_employer_for(p_email)
       = (SELECT id FROM payroll_employers WHERE code = 'LCM');
$$;

-- The gate the pages use: employed on a payroll whose terms are set up. Today
-- that is LCM alone, so this is unchanged in effect; it widens by itself the
-- day the Trustees' terms are entered.
CREATE OR REPLACE FUNCTION has_employment_entitlements(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM payroll_employers e
     WHERE e.id = payroll_employer_for(p_email)
       AND e.entitlements_configured
       AND e.active
  );
$$;

GRANT EXECUTE ON FUNCTION has_employment_entitlements(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION derive_is_lcm_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_lcm_staff := has_employment_entitlements(NEW.email);
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN user_roles.is_lcm_staff IS
  'Derived, never set (192, widened by 194): employed on a payroll whose leave and claim terms are configured. Today that is LCM only. To change it, change the payroll record.';

-- ── Entitlements, scoped to the employer ──────────────────────────────────
CREATE OR REPLACE FUNCTION leave_entitlement(p_code TEXT, p_email TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start    DATE := service_start_for(p_email);
  v_employer UUID := payroll_employer_for(p_email);
  v_days     NUMERIC;
  v_months   NUMERIC;
  v_prorate  BOOLEAN;
  v_min_mths INT;
  v_years    INT;
BEGIN
  SELECT prorate_first_year, min_months_service
    INTO v_prorate, v_min_mths
    FROM leave_types WHERE code = p_code;

  IF v_start IS NOT NULL THEN
    v_years := EXTRACT(YEAR FROM age(CURRENT_DATE, v_start))::INT;
    SELECT days INTO v_days FROM leave_entitlement_bands
     WHERE leave_type_code = p_code
       AND employer_id = v_employer
       AND v_years >= min_years
       AND (max_years IS NULL OR v_years <= max_years)
     ORDER BY min_years DESC LIMIT 1;
  END IF;

  IF v_days IS NULL THEN
    SELECT days_per_year INTO v_days FROM leave_types WHERE code = p_code;
    RETURN ROUND(COALESCE(v_days, 0), 1);
  END IF;

  v_months := EXTRACT(YEAR FROM age(CURRENT_DATE, v_start)) * 12
            + EXTRACT(MONTH FROM age(CURRENT_DATE, v_start));

  IF COALESCE(v_min_mths, 0) > 0 AND v_months < v_min_mths THEN
    RETURN 0;
  END IF;

  IF COALESCE(v_prorate, FALSE)
     AND EXTRACT(YEAR FROM v_start) = EXTRACT(YEAR FROM CURRENT_DATE) THEN
    v_days := v_days * (12 - EXTRACT(MONTH FROM v_start) + 1) / 12;
    v_days := ROUND(v_days * 2) / 2;
  END IF;

  RETURN ROUND(v_days, 1);
END;
$$;

DROP FUNCTION IF EXISTS my_leave_entitlements();

CREATE FUNCTION my_leave_entitlements()
RETURNS TABLE (
  code TEXT, days NUMERIC, years_of_service INT, aggregate_with TEXT,
  kind TEXT, min_months_service INT, band_label TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.jwt() ->> 'email' AS email,
           service_start_for(auth.jwt() ->> 'email') AS started,
           payroll_employer_for(auth.jwt() ->> 'email') AS employer,
           has_employment_entitlements(auth.jwt() ->> 'email') AS entitled,
           (SELECT NULLIF(p.gender, '') FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS gender
  ),
  yrs AS (
    SELECT CASE WHEN started IS NULL THEN NULL
                ELSE EXTRACT(YEAR FROM age(CURRENT_DATE, started))::INT END AS n
      FROM me
  ),
  band_count AS (
    SELECT leave_type_code, count(*) AS n
      FROM leave_entitlement_bands, me
     WHERE employer_id = me.employer
     GROUP BY leave_type_code
  )
  SELECT lt.code,
         leave_entitlement(lt.code, (SELECT email FROM me)),
         (SELECT n FROM yrs),
         lt.aggregate_with,
         CASE
           WHEN bc.n IS NOT NULL      THEN 'BANDED'
           WHEN lt.is_replacement     THEN 'EARNED'
           WHEN COALESCE(lt.days_per_year, 0) > 0 THEN 'FIXED'
           ELSE 'AS_NEEDED'
         END,
         lt.min_months_service,
         CASE WHEN COALESCE(bc.n, 0) < 2 THEN NULL ELSE (
           SELECT CASE
                    WHEN b.max_years IS NULL THEN b.min_years || ' years and over'
                    WHEN b.min_years = 0     THEN 'up to ' || b.max_years || ' years'
                    ELSE b.min_years || ' to ' || b.max_years || ' years'
                  END
             FROM leave_entitlement_bands b
            WHERE b.leave_type_code = lt.code
              AND b.employer_id = (SELECT employer FROM me)
              AND (SELECT n FROM yrs) IS NOT NULL
              AND (SELECT n FROM yrs) >= b.min_years
              AND (b.max_years IS NULL OR (SELECT n FROM yrs) <= b.max_years)
            ORDER BY b.min_years DESC LIMIT 1) END
    FROM leave_types lt
    LEFT JOIN band_count bc ON bc.leave_type_code = lt.code
   WHERE lt.active
     AND (SELECT entitled FROM me)
     AND (lt.restricted_to_gender IS NULL
          OR (SELECT gender FROM me) IS NULL
          OR lt.restricted_to_gender = (SELECT gender FROM me))
   ORDER BY lt.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;

DROP FUNCTION IF EXISTS my_claim_entitlements(INTEGER);

CREATE FUNCTION my_claim_entitlements(p_year INTEGER DEFAULT NULL)
RETURNS TABLE (
  code TEXT, name TEXT, basis TEXT, percent_covered NUMERIC, cap_amount NUMERIC,
  used NUMERIC, remaining NUMERIC, unit_rate NUMERIC, unit_label TEXT,
  source TEXT, note TEXT, scope TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(auth.jwt() ->> 'email') AS email,
           claim_category_for(auth.jwt() ->> 'email') AS category,
           COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) AS yr,
           payroll_employer_for(auth.jwt() ->> 'email') AS employer,
           has_employment_entitlements(auth.jwt() ->> 'email') AS entitled,
           (SELECT p.id FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS person_id,
           (SELECT NULLIF(p.gender, '') FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS gender
  ),
  spent AS (
    SELECT v.claim_category AS code, COALESCE(SUM(v.amount), 0) AS total
      FROM pvs v, me
     WHERE lower(v.applicant_email) = me.email
       AND v.claim_category IS NOT NULL
       AND v.status IN ('APPROVED', 'PAID')
       AND EXTRACT(YEAR FROM v.date)::INT = me.yr
     GROUP BY v.claim_category
  ),
  mine AS (
    SELECT DISTINCT ON (e.claim_code) e.*,
           CASE WHEN e.person_id IS NOT NULL THEN 'PERSONAL' ELSE 'CATEGORY' END AS scope
      FROM claim_entitlements e, me
     WHERE e.active
       AND me.entitled
       AND e.employer_id = me.employer
       AND (e.person_id = me.person_id OR e.person_category = me.category)
     ORDER BY e.claim_code, (e.person_id IS NULL)
  )
  SELECT ct.code, ct.name, m.basis, m.percent_covered, m.cap_amount,
         CASE WHEN m.basis = 'YEARLY' THEN COALESCE(s.total, 0) ELSE NULL END,
         CASE WHEN m.basis = 'YEARLY' THEN GREATEST(m.cap_amount - COALESCE(s.total, 0), 0) ELSE NULL END,
         ct.unit_rate, ct.unit_label, m.source, m.note, m.scope
    FROM mine m
    JOIN claim_types ct ON ct.code = m.claim_code AND ct.active
    LEFT JOIN spent s ON s.code = ct.code
   WHERE (ct.restricted_to_gender IS NULL
          OR (SELECT gender FROM me) IS NULL
          OR ct.restricted_to_gender = (SELECT gender FROM me))
   ORDER BY ct.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_claim_entitlements(INTEGER) TO authenticated;

-- ── Employee numbers, per employer ────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_emp_no(p_employer UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
  last   INT;
BEGIN
  SELECT emp_no_prefix INTO prefix FROM payroll_employers
   WHERE id = COALESCE(p_employer, (SELECT id FROM payroll_employers WHERE code='LCM'));
  prefix := COALESCE(prefix, 'EMP-');

  SELECT COALESCE(MAX(CAST(SUBSTRING(emp_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM payroll_employees
   WHERE emp_no LIKE prefix || '%'
     AND SUBSTRING(emp_no FROM LENGTH(prefix)+1) ~ '^[0-9]+$';

  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

-- Refresh every account against the widened gate.
UPDATE user_roles SET updated_at = NOW();

SELECT e.code, e.name, e.emp_no_prefix, e.entitlements_configured,
       (SELECT count(*) FROM payroll_employees x WHERE x.employer_id = e.id) AS employees,
       (SELECT count(*) FROM payroll_runs r WHERE r.employer_id = e.id)      AS runs,
       (SELECT count(*) FROM claim_entitlements c WHERE c.employer_id = e.id) AS claim_terms,
       (SELECT count(*) FROM leave_entitlement_bands b WHERE b.employer_id = e.id) AS leave_bands
  FROM payroll_employers e ORDER BY e.sort_order;
