-- 177: pro-rating and the qualifying period belong to annual leave alone.
--
-- 174 put two rules into leave_entitlement() and applied them to every banded
-- leave type: no entitlement before six months of service, and pro-rating in
-- the year somebody joined. Both come from the Terms and Conditions, and both
-- clauses are about *annual* leave — A9.3, B8.2, C7.2 say so in terms.
--
-- 176 then added bands for sick leave, which inherited both rules, and the
-- result was wrong in two ways that would have shown on somebody's screen:
--
--   * A person four months into the job showed 0 days of sick leave. Section
--     60F of the Employment Act carries no qualifying period; they have 14.
--   * A person who joined in June showed 13 sick days rather than 14, and 55
--     hospitalisation days rather than 60. Statutory sick leave is not
--     pro-rated by joining month.
--
-- So the two rules become properties of the leave type rather than of the
-- function. Nothing about annual leave changes.
--
-- Also: the pro-rating arithmetic returned values like 14.000000000000000000,
-- because dividing by 12 in numeric keeps the scale. Rounded to one decimal —
-- half a day is the smallest unit anybody takes.

ALTER TABLE leave_types
  ADD COLUMN IF NOT EXISTS prorate_first_year BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS min_months_service INT     NOT NULL DEFAULT 0;

COMMENT ON COLUMN leave_types.prorate_first_year IS
  'Reduce the entitlement proportionately in the year of joining. Annual leave only — T&C A9.3 / B8.2 / C7.2.';
COMMENT ON COLUMN leave_types.min_months_service IS
  'Months of service before any entitlement. 6 for annual leave; 0 for statutory sick leave, which has no qualifying period.';

UPDATE leave_types SET prorate_first_year = TRUE,  min_months_service = 6 WHERE code = 'ANNUAL';
UPDATE leave_types SET prorate_first_year = FALSE, min_months_service = 0
 WHERE code IN ('MEDICAL', 'HOSPITALISATION');

CREATE OR REPLACE FUNCTION leave_entitlement(p_code TEXT, p_email TEXT)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start    DATE := service_start_for(p_email);
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
       AND v_years >= min_years
       AND (max_years IS NULL OR v_years <= max_years)
     ORDER BY min_years DESC LIMIT 1;
  END IF;

  -- No band, or no start date on file: the flat figure still governs.
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
    v_days := ROUND(v_days * 2) / 2;   -- to the nearest half day
  END IF;

  RETURN ROUND(v_days, 1);
END;
$$;

GRANT EXECUTE ON FUNCTION leave_entitlement(TEXT, TEXT) TO authenticated;

-- The three cases that were wrong, read back.
SELECT p.full_name,
       EXTRACT(YEAR FROM age(CURRENT_DATE, service_start_for(COALESCE(p.user_email,p.work_email))))::INT AS yrs,
       leave_entitlement('ANNUAL',          COALESCE(p.user_email,p.work_email)) AS annual,
       leave_entitlement('MEDICAL',         COALESCE(p.user_email,p.work_email)) AS sick,
       leave_entitlement('HOSPITALISATION', COALESCE(p.user_email,p.work_email)) AS hosp
  FROM people p
 WHERE COALESCE(p.user_email,p.work_email) IS NOT NULL
   AND p.payroll_employee_id IS NOT NULL
 ORDER BY yrs LIMIT 6;
