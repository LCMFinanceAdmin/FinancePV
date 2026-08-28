-- 179: make the band label say something worth reading.
--
-- 178 built the label from the band's own bounds, which produced two lines that
-- do not help anybody:
--
--   "60 days — 0 years and over of service"   on hospitalisation, whose single
--                                             band covers everyone, so naming
--                                             it tells the reader nothing
--   "14 days — under 6 years of service"      where the Terms say "1 year to
--                                             5 years"
--
-- So the label is only produced where a type genuinely has more than one band —
-- where the number really does depend on how long you have been here — and the
-- first rung is phrased as an upper bound, which is how the document says it.

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
           service_start_for(auth.jwt() ->> 'email') AS started
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
         -- Only where the figure actually varies with service. A single band
         -- covering everybody is not a fact about the reader.
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
   ORDER BY lt.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;
