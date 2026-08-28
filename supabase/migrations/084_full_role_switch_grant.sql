-- 084: Unrestricted role switching for the test-admin accounts.
--
-- 074b introduced role_switch_grants: switch_own_role() requires an explicit
-- grant row per role, and for MINISTRY_HEAD the chosen ministries must be a
-- subset of that grant's ministries. Without a full set of rows the switcher
-- fails with "No active role-switch grant for X" or "Ministry selection is
-- outside your role-switch grant".
--
-- Two changes so the test admin can move freely between every role:
--   1. '*' in a grant's ministries means "any ministry", so the grant doesn't
--      go stale when a new ministry is added to the lookup.
--   2. BAM_COMMITTEE is allowed as a grantable role — the app offers it in the
--      role switcher, but the original CHECK constraint omitted it, so it could
--      never be granted at all.

-- ── 1. Allow BAM_COMMITTEE to be granted ───────────────────────────────────
ALTER TABLE public.role_switch_grants DROP CONSTRAINT IF EXISTS role_switch_grants_role_check;
ALTER TABLE public.role_switch_grants ADD CONSTRAINT role_switch_grants_role_check
  CHECK (role IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','BUILDING_MANAGER','BAM_COMMITTEE','STAFF'
  ));

-- ── 2. Wildcard ministries ─────────────────────────────────────────────────
-- Only the '*' case is new; every other grant keeps its exact subset check, so
-- this widens nothing for ordinary users. Grants are admin-managed only
-- (role_switch_grants_admin_manage), so a '*' grant is a deliberate act.
CREATE OR REPLACE FUNCTION public.switch_own_role(
  new_role TEXT,
  new_ministries TEXT[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  permitted_ministries TEXT[];
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT grants.ministries INTO permitted_ministries
  FROM public.role_switch_grants grants
  WHERE grants.user_email = caller_email
    AND grants.role = new_role
    AND (grants.expires_at IS NULL OR grants.expires_at > NOW());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active role-switch grant for %', new_role;
  END IF;

  IF new_role = 'MINISTRY_HEAD'
     AND cardinality(new_ministries) > 0
     AND NOT ('*' = ANY(permitted_ministries))
     AND NOT (new_ministries <@ permitted_ministries) THEN
    RAISE EXCEPTION 'Ministry selection is outside your role-switch grant';
  END IF;

  UPDATE public.user_roles
  SET role = new_role,
      ministries = CASE WHEN new_role = 'MINISTRY_HEAD' THEN new_ministries ELSE '{}'::text[] END,
      updated_at = NOW()
  WHERE email = caller_email;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_own_role(TEXT, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_own_role(TEXT, TEXT[]) TO authenticated;

-- ── 3. Grant every role to the test-admin accounts ─────────────────────────
-- Restricted to the same emails the app already treats as test admins
-- (TEST_ADMIN_EMAILS in app/(app)/layout.tsx). The WHERE EXISTS guard keeps
-- this safe if an account isn't present in user_roles, since user_email is a
-- foreign key onto it.
INSERT INTO public.role_switch_grants (user_email, role, ministries, granted_by)
SELECT admin_email, r.role, ARRAY['*'], 'migration_084'
FROM (VALUES ('finance@lcm.org.my'), ('jermaineaaron1991@gmail.com')) AS a(admin_email)
CROSS JOIN (VALUES
  ('FINANCE_ADMIN'),('FINANCE_ADMIN_2'),('FINANCE_ADMIN_3'),
  ('GENERAL_MANAGER'),('BISHOP'),('TREASURER'),('SECRETARY'),
  ('MINISTRY_HEAD'),('BUILDING_MANAGER'),('BAM_COMMITTEE'),('STAFF')
) AS r(role)
WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.email = a.admin_email)
ON CONFLICT (user_email, role) DO UPDATE
  SET ministries = ARRAY['*'],
      expires_at = NULL,
      granted_by = 'migration_084',
      granted_at = NOW();
