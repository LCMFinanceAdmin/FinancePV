-- The signing officers read the church's records; they no longer rewrite them.
--
-- Asked for on 6 October 2026, after this came out of a check on what a
-- Treasurer could actually do: edit all 108 people in the directory, 81 of them
-- carrying IC numbers, and edit the role on all 26 accounts. The second is the
-- serious one -- role is what decides who may approve what, so a signing officer
-- could promote anybody, themselves included, to Finance Executive.
--
-- It also contradicted the rule set in September: Finance writes the money
-- records, the Administrator writes the reference data, everyone else reads.
-- BISHOP, TREASURER and SECRETARY were simply listed alongside them in both
-- gates, which is how it happened.
--
-- READING IS UNCHANGED, which is the whole point of the request. A signatory
-- still opens the directory, the offices and the registers; they can no longer
-- save. Three things make that safe to do by narrowing the write gate alone:
--
--   * can_manage_access guards exactly one policy, user_roles_write, and no
--     read policy at all. user_roles has its own two SELECT policies.
--   * can_manage_people guards 5 read policies and 15 write ones. It is left
--     alone and stays the read gate; the write policies move to a new
--     can_write_people. Every one of the 14 tables involved has its own SELECT
--     policy, so narrowing a FOR ALL policy -- which would otherwise take
--     reading with it -- does not.
--   * Signing itself never touches these tables directly. The signature, the
--     PIN and the role switch all go through SECURITY DEFINER functions
--     (save_my_role_signature, get_my_security_context, switch_own_role), so
--     an officer can still sign a voucher and set their own PIN.
--
-- The General Manager keeps everything. He is a signatory by role but he runs
-- the office rather than signing at the end of it, and taking the directory off
-- him would stop the person who maintains it.

BEGIN;

-- 1. Who may change an account, and so who may change what anybody may approve.
CREATE OR REPLACE FUNCTION public.can_manage_access()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
                       'GENERAL_MANAGER', 'ADMINISTRATOR')
  );
$fn$;

-- 2. Who may change the church's records. can_manage_people is unchanged and
--    remains the question asked for reading; this is the one asked for writing.
CREATE OR REPLACE FUNCTION public.can_write_people()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM user_roles u
     WHERE u.email = auth.jwt() ->> 'email'
       AND u.role::text IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
                            'GENERAL_MANAGER', 'ADMINISTRATOR')
  );
$fn$;

REVOKE ALL ON FUNCTION public.can_write_people() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_people() TO authenticated, service_role;

-- 3. Point every write policy at the new gate.
--
--    Rewritten from each policy's own stored expression with one name
--    substituted, rather than retyped. Several carry conditions of their own --
--    a storage policy also checks its bucket -- and retyping fifteen policies
--    is how a condition goes missing. A policy on SELECT is skipped: reading is
--    not what is changing.
DO $repoint$
DECLARE
  r record;
  v_using text;
  v_check text;
  v_roles text;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, cmd, permissive, roles, qual, with_check
      FROM pg_policies
     WHERE cmd <> 'SELECT'
       AND (COALESCE(qual,'') ILIKE '%can_manage_people()%'
         OR COALESCE(with_check,'') ILIKE '%can_manage_people()%')
  LOOP
    v_using := replace(COALESCE(r.qual, ''), 'can_manage_people()', 'can_write_people()');
    v_check := replace(COALESCE(r.with_check, ''), 'can_manage_people()', 'can_write_people()');
    v_roles := array_to_string(r.roles, ', ');

    EXECUTE format('DROP POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s %s %s',
      r.policyname, r.schemaname, r.tablename,
      CASE WHEN r.permissive = 'PERMISSIVE' THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
      r.cmd, v_roles,
      CASE WHEN r.qual IS NULL THEN '' ELSE 'USING (' || v_using || ')' END,
      CASE WHEN r.with_check IS NULL THEN '' ELSE 'WITH CHECK (' || v_check || ')' END);

    RAISE NOTICE 'repointed %.% / %', r.schemaname, r.tablename, r.policyname;
  END LOOP;
END $repoint$;

COMMIT;
