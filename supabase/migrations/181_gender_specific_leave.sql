-- 181: stop offering maternity leave to men, and paternity leave to women.
--
-- Both were shown to everybody because there was nothing to decide on: gender
-- was blank on all 107 records until 180 filled in 81 of them from the Employee
-- Summary Report.
--
-- The Terms and Conditions are specific. Maternity is "a pastor who has given
-- birth" and the expenses are those "incurred by a pastor herself" (A7.4);
-- paternity is "a pastor whose wife has given birth" (A7.4.3), and B7.3 and
-- C6.3 say the same for parish workers and staff.
--
-- The rule fails open, deliberately. Twenty-six people still have no gender
-- recorded — those created from the contact sheet rather than the payroll
-- report — and they keep seeing both. Hiding a real entitlement from somebody
-- because a field is blank is the worse error by far: they would simply never
-- know they had it. Showing a man maternity leave he will not take costs
-- nothing but a line on a screen.

ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS restricted_to_gender TEXT
  CHECK (restricted_to_gender IS NULL OR restricted_to_gender IN ('Male', 'Female'));

COMMENT ON COLUMN leave_types.restricted_to_gender IS
  'Offered only to people recorded as this gender. NULL means everybody. Somebody with no gender on file sees the type regardless — the check fails open.';

UPDATE leave_types SET restricted_to_gender = 'Female' WHERE code = 'MATERNITY';
UPDATE leave_types SET restricted_to_gender = 'Male'   WHERE code = 'PATERNITY';

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
      FROM leave_entitlement_bands GROUP BY leave_type_code
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
              AND (SELECT n FROM yrs) IS NOT NULL
              AND (SELECT n FROM yrs) >= b.min_years
              AND (b.max_years IS NULL OR (SELECT n FROM yrs) <= b.max_years)
            ORDER BY b.min_years DESC LIMIT 1) END
    FROM leave_types lt
    LEFT JOIN band_count bc ON bc.leave_type_code = lt.code
   WHERE lt.active
     -- Fails open: no restriction, or no gender on file, and it is offered.
     AND (lt.restricted_to_gender IS NULL
          OR (SELECT gender FROM me) IS NULL
          OR lt.restricted_to_gender = (SELECT gender FROM me))
   ORDER BY lt.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;

SELECT count(*) FILTER (WHERE gender = 'Male')   AS men,
       count(*) FILTER (WHERE gender = 'Female') AS women,
       count(*) FILTER (WHERE gender IS NULL)    AS unknown_sees_both
  FROM people;
