-- 072: fix user_roles so Finance Admin can manage all users
--      and BUILDING_MANAGER / BAM_COMMITTEE are valid roles

-- 1. Drop the old CHECK constraint that was missing BUILDING_MANAGER / BAM_COMMITTEE
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;

-- 2. Add it back with the full role list
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','BUILDING_MANAGER','BAM_COMMITTEE','STAFF'
  ));

-- 3. Allow Finance Admin to insert / update / delete any user_roles row
DROP POLICY IF EXISTS "user_roles_finance_admin_manage" ON user_roles;
CREATE POLICY "user_roles_finance_admin_manage" ON user_roles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND ur.role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3')
    )
  );
