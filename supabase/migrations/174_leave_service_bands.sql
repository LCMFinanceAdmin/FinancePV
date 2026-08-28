-- 174: annual leave rises with service, as the Terms and Conditions say.
--
-- Source: "Terms and Conditions of Service", revised 21 August 2013, clauses
-- A9.1 (pastors), B8.1 (parish workers) and C7.1 (ministry & administrative
-- staff). All three carry the identical chart:
--
--     1 year to 5 years    14 days
--     6 years to 10 years  21 days
--     11 years and above   25 days
--
-- The app gave everybody 14 — the first band — so anybody past five years of
-- service has been under-credited, which for a church whose pastors' service
-- runs to several decades is most of them.
--
-- Two more rules from the same clauses, which the flat number could not express:
--
--   * No entitlement before six months of service (A9.3, B8.2, C7.2).
--   * An incomplete calendar year is pro-rated.
--
-- Both are computed rather than stored, because they depend on today's date.
-- Carry-forward is not implemented and must not be: all three clauses say
-- unclaimed leave cannot be carried into the next year, and the balance is
-- already reckoned per calendar year.
--
-- Only ANNUAL gets bands here. The document says nothing at all about sick
-- leave, and its maternity and paternity figures are below what Malaysian law
-- now requires, so those are deliberately left alone — see the note at the end.

CREATE TABLE IF NOT EXISTS leave_entitlement_bands (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_type_code TEXT NOT NULL REFERENCES leave_types(code) ON DELETE CASCADE,
  min_years       INT  NOT NULL,
  -- NULL means "and above".
  max_years       INT,
  days            NUMERIC NOT NULL,
  source          TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT band_years_ordered CHECK (max_years IS NULL OR max_years >= min_years)
);

CREATE UNIQUE INDEX IF NOT EXISTS leave_bands_unique
  ON leave_entitlement_bands (leave_type_code, min_years);

ALTER TABLE leave_entitlement_bands ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "leb_read" ON leave_entitlement_bands;
CREATE POLICY "leb_read" ON leave_entitlement_bands FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "leb_write" ON leave_entitlement_bands;
CREATE POLICY "leb_write" ON leave_entitlement_bands FOR ALL TO authenticated
  USING (is_finance_admin_or_senior()) WITH CHECK (is_finance_admin_or_senior());

DELETE FROM leave_entitlement_bands WHERE leave_type_code = 'ANNUAL';
INSERT INTO leave_entitlement_bands (leave_type_code, min_years, max_years, days, source) VALUES
  ('ANNUAL',  0,  5, 14, 'T&C 21 Aug 2013, A9.1 / B8.1 / C7.1'),
  ('ANNUAL',  6, 10, 21, 'T&C 21 Aug 2013, A9.1 / B8.1 / C7.1'),
  ('ANNUAL', 11, NULL, 25, 'T&C 21 Aug 2013, A9.1 / B8.1 / C7.1');

-- ── When did this person start? ───────────────────────────────────────────
-- Payroll is the firmer of the two, being what the salary is calculated from;
-- the directory's date_joined covers people who are not on LCM's payroll.
CREATE OR REPLACE FUNCTION service_start_for(p_email TEXT)
RETURNS DATE
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(pe.date_commenced, p.date_joined)
    FROM people p
    LEFT JOIN payroll_employees pe ON pe.person_id = p.id
   WHERE lower(p.user_email) = lower(p_email)
      OR lower(COALESCE(p.work_email, '')) = lower(p_email)
   ORDER BY pe.date_commenced NULLS LAST
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION service_start_for(TEXT) TO authenticated;

-- ── The entitlement itself ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION leave_entitlement(p_code TEXT, p_email TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_start   DATE := service_start_for(p_email);
  v_years   INT;
  v_days    NUMERIC;
  v_months  NUMERIC;
BEGIN
  -- No bands for this type: the flat figure on leave_types still governs.
  SELECT days INTO v_days FROM leave_entitlement_bands
   WHERE leave_type_code = p_code
     AND (v_start IS NOT NULL)
     AND EXTRACT(YEAR FROM age(CURRENT_DATE, v_start))::INT >= min_years
     AND (max_years IS NULL OR EXTRACT(YEAR FROM age(CURRENT_DATE, v_start))::INT <= max_years)
   ORDER BY min_years DESC LIMIT 1;

  IF v_days IS NULL THEN
    SELECT days_per_year INTO v_days FROM leave_types WHERE code = p_code;
    RETURN COALESCE(v_days, 0);
  END IF;

  -- "no new co-worker shall be eligible to any annual leave before completing
  -- at least six months of service" — A9.3, B8.2, C7.2.
  v_months := EXTRACT(YEAR FROM age(CURRENT_DATE, v_start)) * 12
            + EXTRACT(MONTH FROM age(CURRENT_DATE, v_start));
  IF v_months < 6 THEN
    RETURN 0;
  END IF;

  -- "entitlement for any incomplete calendar year shall be calculated
  -- proportionately". Only bites in the year somebody joined.
  IF EXTRACT(YEAR FROM v_start) = EXTRACT(YEAR FROM CURRENT_DATE) THEN
    v_days := v_days * (12 - EXTRACT(MONTH FROM v_start) + 1) / 12;
    -- Half a day is the smallest unit anybody takes.
    v_days := ROUND(v_days * 2) / 2;
  END IF;

  v_years := EXTRACT(YEAR FROM age(CURRENT_DATE, v_start))::INT;
  RETURN v_days;
END;
$$;

GRANT EXECUTE ON FUNCTION leave_entitlement(TEXT, TEXT) TO authenticated;

-- One call for the whole page, rather than one per leave type.
CREATE OR REPLACE FUNCTION my_leave_entitlements()
RETURNS TABLE (code TEXT, days NUMERIC, years_of_service INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT lt.code,
         leave_entitlement(lt.code, auth.jwt() ->> 'email'),
         CASE WHEN service_start_for(auth.jwt() ->> 'email') IS NULL THEN NULL
              ELSE EXTRACT(YEAR FROM age(CURRENT_DATE,
                     service_start_for(auth.jwt() ->> 'email')))::INT END
    FROM leave_types lt
   WHERE lt.active;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;

-- What the bands now say, and for how many people they change the answer.
SELECT (SELECT count(*) FROM leave_entitlement_bands WHERE leave_type_code='ANNUAL') AS annual_bands,
       count(*) FILTER (WHERE yrs BETWEEN 0 AND 5)   AS band_14,
       count(*) FILTER (WHERE yrs BETWEEN 6 AND 10)  AS band_21,
       count(*) FILTER (WHERE yrs >= 11)             AS band_25
  FROM (SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, pe.date_commenced))::INT AS yrs
          FROM payroll_employees pe WHERE pe.status='ACTIVE' AND pe.date_commenced IS NOT NULL) s;
