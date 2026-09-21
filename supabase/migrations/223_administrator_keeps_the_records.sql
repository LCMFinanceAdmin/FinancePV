-- 223: the person who keeps the church's records may write them down.
--
-- The Administrator has been able to open Settings -> Church Directory since
-- the page was built — lib/nav.tsx shows it to her, under a comment saying
-- lookups and logins stay with the Finance Executive while "the church records
-- below are shared". The policies never agreed: congregations and districts
-- admit Finance and the General Manager only.
--
-- Because row-level security filters rows rather than raising, that mismatch
-- was silent. She filled in the ROS number for forty-nine churches, was told
-- each was saved, and lost all of it on reload. The application half of that
-- is fixed separately; this is the half that decides whether she can do the
-- job at all.
--
-- Note what these two policies are: a copy of can_manage_directory()'s role
-- list, written inline, which then drifted from the function of the same
-- meaning. Both now call the function, so the next change has one place to
-- happen rather than three that must agree.

CREATE OR REPLACE FUNCTION public.can_manage_directory()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE lower(ur.email) = lower(auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
                       'GENERAL_MANAGER',
                       -- Keeps the people directory and the church's records.
                       -- No part in the money: this grants the register, not
                       -- vouchers, budgets or payroll.
                       'ADMINISTRATOR')
  );
$$;

REVOKE EXECUTE ON FUNCTION can_manage_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_manage_directory() TO authenticated, service_role;

-- The two that had their own copy of the list.
DROP POLICY IF EXISTS "congregations_write" ON congregations;
CREATE POLICY "congregations_write" ON congregations
  FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());

DROP POLICY IF EXISTS "districts_write" ON districts;
CREATE POLICY "districts_write" ON districts
  FOR ALL TO authenticated
  USING (can_manage_directory()) WITH CHECK (can_manage_directory());
