-- 178: tell the page what kind of entitlement each leave type is.
--
-- The balance cards printed leave_types.days_per_year as "14 days / year" while
-- the figure beside it came from the service bands, so somebody with 18 days of
-- sick leave read "14 days / year — 18 remaining, 18 total" and had no way to
-- know which number to believe. The subtitle was simply the wrong source.
--
-- Fixing that alone is not enough, because zero means two different things and
-- the page cannot tell them apart:
--
--   * Compassionate, study and unpaid leave have no fixed yearly allowance at
--     all. They are applied for as the need arises. Printing "0 days / year"
--     next to "0 remaining" reads as a refusal.
--   * Annual leave really is zero for somebody who has not yet completed six
--     months of service — a real entitlement they do not have yet.
--
-- So the classification moves into the database, where the bands and the rules
-- already live, rather than being guessed at from a zero.

DROP FUNCTION IF EXISTS my_leave_entitlements();

CREATE FUNCTION my_leave_entitlements()
RETURNS TABLE (
  code TEXT,
  days NUMERIC,
  years_of_service INT,
  aggregate_with TEXT,
  -- BANDED    rises with service, from leave_entitlement_bands
  -- FIXED     the same every year for everybody
  -- EARNED    only what has been worked for (replacement)
  -- AS_NEEDED no fixed allowance; applied for as the occasion arises
  kind TEXT,
  min_months_service INT,
  band_label TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.jwt() ->> 'email' AS email,
           service_start_for(auth.jwt() ->> 'email') AS started
  ),
  yrs AS (
    SELECT CASE WHEN started IS NULL THEN NULL
                ELSE EXTRACT(YEAR FROM age(CURRENT_DATE, started))::INT END AS n
      FROM me
  )
  SELECT lt.code,
         leave_entitlement(lt.code, (SELECT email FROM me)),
         (SELECT n FROM yrs),
         lt.aggregate_with,
         CASE
           WHEN EXISTS (SELECT 1 FROM leave_entitlement_bands b WHERE b.leave_type_code = lt.code)
             THEN 'BANDED'
           WHEN lt.is_replacement THEN 'EARNED'
           WHEN COALESCE(lt.days_per_year, 0) > 0 THEN 'FIXED'
           ELSE 'AS_NEEDED'
         END,
         lt.min_months_service,
         -- Which rung of the ladder this person is on, in words, so the card
         -- can say why the number is what it is.
         (SELECT CASE
                   WHEN b.max_years IS NULL THEN b.min_years || ' years and over'
                   WHEN b.min_years = 0     THEN 'under ' || (b.max_years + 1) || ' years'
                   ELSE b.min_years || ' to ' || b.max_years || ' years'
                 END
            FROM leave_entitlement_bands b
           WHERE b.leave_type_code = lt.code
             AND (SELECT n FROM yrs) IS NOT NULL
             AND (SELECT n FROM yrs) >= b.min_years
             AND (b.max_years IS NULL OR (SELECT n FROM yrs) <= b.max_years)
           ORDER BY b.min_years DESC LIMIT 1)
    FROM leave_types lt
   WHERE lt.active
   ORDER BY lt.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;

SELECT code, kind, days, band_label
  FROM my_leave_entitlements()
 LIMIT 0;   -- shape check only; auth.jwt() is empty from the CLI
