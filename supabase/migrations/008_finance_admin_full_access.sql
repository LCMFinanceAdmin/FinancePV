-- Grant Finance Admin full visibility and access across all tables
-- This ensures Finance Admin and senior roles can see everything in the system

-- Helper function to check if user is Finance Admin or senior role
CREATE OR REPLACE FUNCTION is_finance_admin_or_senior()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.email = auth.jwt() ->> 'email'
    AND user_roles.role IN (
      'FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
      'GENERAL_MANAGER', 'TREASURER', 'BISHOP', 'SECRETARY'
    )
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- Update budget_items table policies for Finance Admin full access
DO $$
BEGIN
  DROP POLICY IF EXISTS "budget_items_write_finance_admin" ON budget_items;
  DROP POLICY IF EXISTS "budget_items_read_authenticated" ON budget_items;
  DROP POLICY IF EXISTS "budget_items_read_all" ON budget_items;

  CREATE POLICY "budget_items_finance_admin_full_access" ON budget_items
    FOR ALL
    USING (is_finance_admin_or_senior());

  CREATE POLICY "budget_items_read_authenticated" ON budget_items
    FOR SELECT
    USING (
      auth.role() = 'authenticated_user' OR is_finance_admin_or_senior()
    );

  RAISE NOTICE 'Updated budget_items policies';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Error updating budget_items policies: %', SQLERRM;
END $$;

-- Ensure pvs table allows Finance Admin to see all records
DO $$
BEGIN
  ALTER TABLE IF EXISTS pvs ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "pvs_finance_admin" ON pvs;

  CREATE POLICY "pvs_finance_admin_full_access" ON pvs
    FOR ALL
    USING (is_finance_admin_or_senior());

  RAISE NOTICE 'Updated pvs policies';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Note: pvs table may not exist or policies already configured';
END $$;

-- Ensure user_roles table allows Finance Admin to see all users
DO $$
BEGIN
  ALTER TABLE IF EXISTS user_roles ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "user_roles_read" ON user_roles;

  CREATE POLICY "user_roles_read_admin" ON user_roles
    FOR SELECT
    USING (is_finance_admin_or_senior());

  RAISE NOTICE 'Updated user_roles policies';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Note: user_roles table policies already exist';
END $$;

-- Ensure ministry_projects table allows Finance Admin to see all projects
DO $$
BEGIN
  ALTER TABLE IF EXISTS ministry_projects ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "ministry_projects_read" ON ministry_projects;
  DROP POLICY IF EXISTS "ministry_projects_write" ON ministry_projects;

  CREATE POLICY "ministry_projects_read_admin" ON ministry_projects
    FOR SELECT
    USING (is_finance_admin_or_senior());

  CREATE POLICY "ministry_projects_manage_admin" ON ministry_projects
    FOR ALL
    USING (is_finance_admin_or_senior());

  RAISE NOTICE 'Updated ministry_projects policies';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Note: ministry_projects table may not have RLS enabled yet';
END $$;

-- Ensure notifications table allows Finance Admin to see all
DO $$
BEGIN
  ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS "notifications_read" ON notifications;

  CREATE POLICY "notifications_read_admin" ON notifications
    FOR SELECT
    USING (is_finance_admin_or_senior());

  RAISE NOTICE 'Updated notifications policies';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Note: notifications table may not exist';
END $$;
