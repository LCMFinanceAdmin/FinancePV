-- 210: only the people who administer access may change it.
--
-- user_roles carried `FOR ALL USING (auth.role() = 'authenticated')`. Any
-- signed-in user could rewrite any role row, including their own — set
-- yourself GENERAL_MANAGER and the whole approval chain is yours.
--
-- On its own that is a hole you need an account to reach. But sign-up is
-- self-serve: the login page sends a magic link to any address and Supabase
-- creates the user on first use, which is how kpkwan63@gmail.com exists.
-- Together they are a path from "can receive email" to "approves the church's
-- payments", and the role-switch grants that carefully gate switch_own_role
-- are beside the point when the table underneath is writable by anyone.
--
-- The set permitted here is exactly canManagePeople in lib/nav.tsx — the same
-- people the UI already lets open Access & Roles. is_finance_admin_or_senior()
-- was close but omits the Administrator, who keeps the directory and would
-- have been locked out of her own page.
--
-- Every function that writes user_roles — all eleven, switch_own_role and
-- save_my_role_signature among them — is SECURITY DEFINER and so bypasses RLS.
-- Nothing a person does for themselves goes through a direct write.

CREATE OR REPLACE FUNCTION can_manage_access()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles u
     WHERE u.email = auth.jwt() ->> 'email'
       AND u.role::text IN (
         'FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
         'GENERAL_MANAGER', 'TREASURER', 'BISHOP', 'SECRETARY',
         'ADMINISTRATOR'
       )
  );
$$;

GRANT EXECUTE ON FUNCTION can_manage_access() TO authenticated;

COMMENT ON FUNCTION can_manage_access() IS
  'Who may change who can sign in and what they may approve. Mirrors canManagePeople in lib/nav.tsx — keep the two in step.';

DROP POLICY IF EXISTS user_roles_write ON user_roles;

CREATE POLICY user_roles_write ON user_roles
  FOR ALL
  USING (can_manage_access())
  WITH CHECK (can_manage_access());

-- Reads are unchanged: user_roles_select still admits any authenticated user,
-- and permissive policies are OR-ed, so the directory lookups the app makes
-- everywhere still work. Narrowing reads is a separate question with a
-- different blast radius.

SELECT polname::text AS policy,
       CASE polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT'
                   WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' ELSE 'ALL' END AS cmd,
       pg_get_expr(polqual, polrelid) AS using_expr
  FROM pg_policy WHERE polrelid='user_roles'::regclass ORDER BY polname;
