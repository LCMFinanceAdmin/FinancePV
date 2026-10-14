-- What is missing before somebody's leave can be worked out properly.
--
-- Leave reads two things from the people directory and complains about neither
-- when they are absent. Gender decides whether maternity or paternity is
-- offered at all. date_joined -- or a payroll commencement date, whichever
-- exists -- is the service start, and service is what moves annual leave from
-- 14 days to 21 and medical from 14 to 22.
--
-- So a person with no directory record, or one with the date left blank, is
-- quietly given the base entitlement and nobody is told. Payroll has had a
-- compliance count on its own page for a while; leave has had nothing.
--
-- This answers it for the people it actually matters for: those whose leave LCM
-- administers. A volunteer with no service date is not a gap, because they have
-- no leave to be short of.

BEGIN;

CREATE OR REPLACE FUNCTION public.leave_service_gaps()
RETURNS TABLE(email text, full_name text, has_directory boolean,
              service_start date, gender text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  -- Definer rights, so it checks for itself rather than resting on the grant.
  -- 212 is the reason.
  IF NOT (is_finance_admin_or_senior() OR can_oversee_leave()) THEN
    RAISE EXCEPTION 'Only somebody with sight of everyone''s leave may read this';
  END IF;

  RETURN QUERY
  SELECT u.email::text,
         u.full_name::text,
         EXISTS (SELECT 1 FROM people p
                  WHERE lower(COALESCE(p.user_email, '')) = lower(u.email)
                     OR lower(COALESCE(p.work_email, '')) = lower(u.email)),
         service_start_for(u.email),
         (SELECT NULLIF(p.gender, '') FROM people p
           WHERE lower(COALESCE(p.user_email, '')) = lower(u.email)
              OR lower(COALESCE(p.work_email, '')) = lower(u.email)
           LIMIT 1)::text
    FROM user_roles u
   WHERE COALESCE(u.is_test_account, false) = false
     AND u.role <> 'GUEST'
     -- Only those who have leave to be short of.
     AND leave_administered_here(u.email)
   ORDER BY u.full_name;
END;
$fn$;

REVOKE ALL ON FUNCTION public.leave_service_gaps() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leave_service_gaps() TO authenticated, service_role;

COMMIT;
