-- 116: finish what 074b and 086 set out to do.
-- (074 was renumbered 074b on cleanup; the filename here keeps its original
--  spelling, because that is the name this migration has always had.)
--
-- Those migrations revoked EXECUTE on their SECURITY DEFINER functions FROM
-- PUBLIC, which reads as though it closes the door. It does not, on Supabase:
-- default privileges also grant EXECUTE to `anon` explicitly, so the ACL is
--
--   =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
--
-- and removing the first entry leaves the third. Every function 074b hardened
-- has therefore been callable by anon ever since, with the anon key that ships
-- in the browser bundle. 115 hit the same trap and was corrected before it ran.
--
-- No exposure follows from it — all five check the caller, and auth.jwt() is
-- null without a session, so they fail closed. This is about the declared
-- intent of those migrations actually holding.
--
-- Five, not six. `is_finance_admin_or_senior` is deliberately left alone: it is
-- a policy helper used by {public} policies on pvs, user_roles and
-- ministry_projects, and a policy's helper has to be executable by every role
-- that evaluates the policy. Revoke it and an anonymous read of pvs raises
-- "permission denied for function" instead of returning no rows — a worse
-- outcome, for no gain, since it already returns false for anon.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
       AND p.prorettype <> 'trigger'::regtype
       AND p.proname IN (
         'switch_own_role',              -- changes your own active role
         'get_my_security_context',      -- approval PIN state and saved signatures
         'save_my_role_signature',
         'withdraw_my_loan_application',
         'approve_budget_proposal'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
  END LOOP;
END $$;

-- service_role keeps its grant throughout: the edge functions run as it.
-- Trigger functions are excluded by prorettype — PostgREST cannot call them,
-- and a trigger runs as the statement's owner regardless of who is calling.
