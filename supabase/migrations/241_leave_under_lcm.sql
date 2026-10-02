-- LCM administers the leave of people it does not employ.
--
-- Sean Cham and Eddie Kwan are employed by the Trustees of the Lutheran Church
-- in Malaysia (Registered), not by LCM. That is correct and is not changed here.
-- Their leave applications, however, go through the General Manager like any
-- other member of office staff -- confirmed on 2 October 2026 -- and until now
-- they could not file one at all. Two separate gates turned them away:
--
--   StaffOnly                     reads user_roles.is_lcm_staff and refuses the
--                                 page outright.
--   has_employment_entitlements   needs an ACTIVE payroll_employees row under an
--                                 employer whose entitlements are configured.
--                                 Neither man has a payroll record, so
--                                 my_leave_entitlements returned nothing and no
--                                 leave type was on offer.
--
-- Setting is_lcm_staff would not work and would not be true. It is derived:
-- trg_derive_is_lcm_staff overwrites it from has_employment_entitlements on
-- every write, so a hand-set value reverts the next time the row is saved. It
-- also gates staff loans and salary, which genuinely are LCM's and do not
-- extend to a Trustees employee.
--
-- So the two questions are separated. "Does LCM employ you" stays derived and
-- keeps its hold on loans and salary. "Does LCM administer your leave" becomes
-- a plain column that nothing recomputes, and only leave consults it.
--
-- has_employment_entitlements is deliberately left alone: my_claim_entitlements
-- and derive_is_lcm_staff both call it, and widening it would hand out claim
-- entitlements and LCM staff status along with the leave.

BEGIN;

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS leave_under_lcm boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN user_roles.leave_under_lcm IS
  'LCM administers this person''s leave although LCM does not employ them -- a '
  'Trustees employee at HQ. Set by hand; unlike is_lcm_staff nothing derives it. '
  'Grants no claim, loan or salary entitlement.';

-- Who that is today: anyone with an account whose recorded organisation is a
-- body this church runs payroll for. That is the Trustees and nothing else --
-- the other organisations on file are partners and associates, not employers
-- here, which is why this asks about payroll rather than about having any
-- organisation at all.
DO $$
DECLARE v_names text;
BEGIN
  WITH touched AS (
    UPDATE user_roles u SET leave_under_lcm = true, updated_at = now()
     WHERE u.is_pastor IS NOT TRUE
       AND u.leave_under_lcm = false
       AND EXISTS (
             SELECT 1
               FROM people p
               JOIN payroll_employers e ON e.organisation_id = p.organisation_id
              WHERE (lower(p.user_email) = lower(u.email)
                  OR lower(COALESCE(p.work_email, '')) = lower(u.email))
                AND e.active)
    RETURNING u.full_name)
  SELECT string_agg(full_name, ', ' ORDER BY full_name) INTO v_names FROM touched;
  RAISE NOTICE 'leave now administered by LCM for: %', COALESCE(v_names, '(nobody)');
END $$;

-- The leave-side question, asked in one place so the two functions below cannot
-- drift apart. Employment entitlements still carry leave with them; the column
-- only adds people they do not reach.
CREATE OR REPLACE FUNCTION public.leave_administered_here(p_email text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT has_employment_entitlements(p_email)
      OR EXISTS (SELECT 1 FROM user_roles u
                  WHERE lower(u.email) = lower(p_email)
                    AND u.leave_under_lcm);
$fn$;

-- PostgreSQL grants EXECUTE to PUBLIC by default and anon inherits it, which
-- for a definer function is a hole rather than a convenience. 212 is the
-- precedent.
REVOKE ALL ON FUNCTION public.leave_administered_here(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_administered_here(text) TO authenticated, service_role;

COMMIT;

BEGIN;

-- Unchanged but for the one line that asks the question: entitled is now
-- leave_administered_here rather than has_employment_entitlements.
CREATE OR REPLACE FUNCTION public.my_leave_entitlements()
RETURNS TABLE(code text, days numeric, years_of_service integer, aggregate_with text,
              kind text, min_months_service integer, band_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  WITH me AS (
    SELECT auth.jwt() ->> 'email' AS email,
           service_start_for(auth.jwt() ->> 'email') AS started,
           payroll_employer_for(auth.jwt() ->> 'email') AS employer,
           leave_administered_here(auth.jwt() ->> 'email') AS entitled,
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
$fn$;

REVOKE ALL ON FUNCTION public.my_leave_entitlements() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_leave_entitlements() TO authenticated, service_role;

-- The overview that reads everyone asks the same question, so the two cannot
-- disagree about who has leave. Nothing calls this today, which is exactly why
-- it is changed now rather than left as a trap for whoever wires it up.
CREATE OR REPLACE FUNCTION public.leave_entitlements_everyone()
RETURNS TABLE(email text, code text, days numeric, years_of_service integer,
              kind text, aggregate_with text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
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
     -- No payroll, no LCM leave (191), unless LCM administers this person's
     -- leave without employing them (241). Somebody not entitled comes back
     -- with no rows at all, which is how the page tells them from somebody at
     -- zero: the difference between "not on our payroll" and "has used the lot".
     WHERE leave_administered_here(ur.email)
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
$fn$;

REVOKE ALL ON FUNCTION public.leave_entitlements_everyone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_entitlements_everyone() TO authenticated, service_role;

COMMIT;
