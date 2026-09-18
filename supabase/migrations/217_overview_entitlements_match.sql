-- 217: the overview quoted everybody's entitlement from the bottom rung.
--
-- Two pages print a leave entitlement. /my-leaves asks the database, through
-- my_leave_entitlements(), and gets the service-banded answer — 21 days annual
-- for somebody seven years in. /leave-overview read leave_types.days_per_year
-- straight off the table and got 14, which is right for a new joiner and wrong
-- for everybody else.
--
-- The overview's own footnote tells the reader the figures are "the same sum
-- each person sees on their own My Leave page". They were not, and the overview
-- is what the office answers questions from, so the disagreement was being
-- resolved in favour of the wrong page.
--
-- my_leave_entitlements() cannot serve it: it answers for auth.jwt() and nobody
-- else, while the overview needs a row per person. This is the same query keyed
-- on each employed address instead — the same bands, the same proration, the
-- same gender restriction — so the two cannot drift apart again.
--
-- Gated on the database's own definition of who may see everyone's leave (the
-- SELECT policy from 107) rather than on the role list kept in the page. It
-- reads nothing the caller could not already read application by application.

CREATE OR REPLACE FUNCTION leave_entitlements_everyone()
RETURNS TABLE (
  email TEXT, code TEXT, days NUMERIC, years_of_service INT,
  kind TEXT, aggregate_with TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  -- It holds definer rights, so it checks for itself rather than resting on the
  -- grant alone. 212 is the reason: one REVOKE away is not far enough.
  IF NOT (is_finance_admin_or_senior() OR can_oversee_leave()) THEN
    RAISE EXCEPTION 'Only somebody with sight of everyone''s leave may read all entitlements';
  END IF;

  RETURN QUERY
  WITH folk AS (
    SELECT ur.email::TEXT                 AS addr,
           service_start_for(ur.email)    AS started,
           payroll_employer_for(ur.email) AS employer,
           (SELECT NULLIF(p.gender, '') FROM people p
             WHERE lower(p.user_email) = lower(ur.email)
                OR lower(COALESCE(p.work_email, '')) = lower(ur.email)
             LIMIT 1)                     AS gender
      FROM user_roles ur
     -- No payroll, no LCM leave (191). Somebody not entitled comes back with no
     -- rows at all, which is how the page tells them from somebody at zero —
     -- the difference between "not on our payroll" and "has used the lot".
     WHERE has_employment_entitlements(ur.email)
  ),
  banded AS (
    SELECT DISTINCT leave_type_code, employer_id FROM leave_entitlement_bands
  )
  SELECT f.addr,
         lt.code,
         leave_entitlement(lt.code, f.addr),
         CASE WHEN f.started IS NULL THEN NULL
              ELSE EXTRACT(YEAR FROM age(CURRENT_DATE, f.started))::INT END,
         CASE
           WHEN b.leave_type_code IS NOT NULL     THEN 'BANDED'
           WHEN lt.is_replacement                 THEN 'EARNED'
           WHEN COALESCE(lt.days_per_year, 0) > 0 THEN 'FIXED'
           ELSE 'AS_NEEDED'
         END,
         lt.aggregate_with
    FROM folk f
    CROSS JOIN leave_types lt
    LEFT JOIN banded b
           ON b.leave_type_code = lt.code
          AND b.employer_id = f.employer
   WHERE lt.active
     -- A man is not offered maternity leave (181), and the overview should not
     -- rule a column of it against him either.
     AND (lt.restricted_to_gender IS NULL
          OR f.gender IS NULL
          OR lt.restricted_to_gender = f.gender)
   ORDER BY f.addr, lt.sort_order;
END;
$$;

REVOKE EXECUTE ON FUNCTION leave_entitlements_everyone() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION leave_entitlements_everyone() TO authenticated;

COMMENT ON FUNCTION leave_entitlements_everyone() IS
  'Every employed person''s leave entitlement, banded by service — the overview''s figures, arrived at exactly as my_leave_entitlements() arrives at each person''s own. Read-only; gated on who may read all leave applications.';

-- Proof, and it needs no session: the flat column the overview used to print,
-- against the banded answer /my-leaves has been giving all along. Every row
-- returned here is a figure somebody was shown wrongly.
SELECT ur.email,
       lt.code,
       lt.days_per_year                     AS overview_used_to_say,
       leave_entitlement(lt.code, ur.email) AS my_leave_says
  FROM user_roles ur
  CROSS JOIN leave_types lt
 WHERE has_employment_entitlements(ur.email)
   AND lt.active
   AND lt.days_per_year <> leave_entitlement(lt.code, ur.email)
 ORDER BY ur.email, lt.code
 LIMIT 30;
