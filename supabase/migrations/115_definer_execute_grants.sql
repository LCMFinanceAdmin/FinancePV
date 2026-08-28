-- 115: SECURITY DEFINER functions should not be executable by the world.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, so writing
-- `GRANT EXECUTE ... TO authenticated` adds nothing — the function was already
-- callable by anyone, including `anon`. And `anon` is not hypothetical: the
-- anon key ships in the browser bundle, so it is public knowledge by design.
--
-- Revoking from PUBLIC alone is not enough here. Supabase's default privileges
-- also grant EXECUTE to `anon` *explicitly*, so the ACL on a new function reads
--
--   =X/postgres | postgres=X | anon=X | authenticated=X | service_role=X
--
-- and dropping the first entry leaves the third doing exactly the same job.
-- Both have to go. service_role keeps its grant: the edge functions run as it.
--
-- Migration 074b established the fix (REVOKE ALL ... FROM PUBLIC, then grant to
-- the role that should have it) but only applied it to five functions. Twenty
-- more have been added since without it, including three of my own in 114.
--
-- Most of those are predicates keyed on auth.jwt(), which simply return false
-- for a caller with no JWT, and the mutating ones (assign_ministry_head,
-- delete_cancelled_pv, finalize_payroll_run, locked_pins) all check the caller
-- inside the body. So this is defence in depth rather than a door standing
-- open — with one real exception:
--
--   is_delegated_verifier(email, ministry, project) takes an arbitrary email
--   and answers from a definer context, so anyone at all could ask whether a
--   given address verifies for a given ministry.
--
-- Deliberately NOT included, because they are public by design and revoking
-- them would break the public booking page at /book, which is used with no
-- login at all:
--
--   next_booking_no, public_booked_ranges, public_blocked_ranges
--
-- Trigger functions (create_dean_office_for_district and its rename twin) are
-- also left alone — PostgREST does not expose them, and a trigger runs as the
-- statement's owner regardless.

DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef                      -- SECURITY DEFINER only
       AND p.proname IN (
         -- 114, this session
         'is_delegated_verifier', 'my_verifier_scopes', 'can_manage_ministry_verifiers',
         -- predicates: harmless to an anonymous caller, but nothing gains by
         -- their being callable
         'can_manage_people', 'can_manage_payment_refs', 'can_oversee_leave',
         'can_manage_payroll', 'can_oversee_payroll', 'my_payroll_employee_id',
         -- these do something, and already check the caller themselves
         'assign_ministry_head', 'assign_bam_committee', 'delete_cancelled_pv',
         'finalize_payroll_run', 'locked_pins', 'next_payment_ref',
         -- allocates a number; an anonymous caller could burn the sequence and
         -- leave gaps in worksheet numbering
         'next_worksheet_no',
         -- writes reminder notifications; anonymous callers could repeat it at
         -- will. pg_cron runs as superuser and is unaffected by this.
         'fn_fd_maturity_reminders'
       )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', fn.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn.sig);
  END LOOP;
END $$;

-- Written as a loop over pg_proc rather than a list of REVOKE statements
-- because REVOKE needs the exact argument types, and getting one wrong fails
-- silently in the sense that matters: the statement errors, you fix that one,
-- and the function you actually cared about stays world-executable. This way
-- the names are the input and the signatures are looked up.
