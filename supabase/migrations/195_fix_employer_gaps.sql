-- 195: two holes left by 191 and 194.
--
-- ── 1. next_emp_no() was never replaced ──────────────────────────────────
-- 194 wrote CREATE OR REPLACE FUNCTION next_emp_no(p_employer UUID DEFAULT
-- NULL). That is not a replacement. The original takes no arguments, so
-- Postgres kept both and the database has been carrying two functions of the
-- same name ever since: the employer-aware one, and the original that hardcodes
-- the 'EMP-' prefix.
--
-- Which one a caller gets depends on whether it passes the argument. The
-- Payroll page was updated by 194 and gets the new one. The People page's
-- employment panel calls next_emp_no() with no arguments and got the old one —
-- so a Trustees employee added from their own profile would have been given an
-- LCM employee number. Together with the employer_id column default, which that
-- panel also never set, they would have become an LCM employee outright, and
-- 191's rule would have handed them LCM's leave and claims back.
--
-- The panel is fixed in the same commit. This removes the function that made
-- the mistake possible, so the next caller cannot repeat it: with only one
-- next_emp_no left, an omitted argument means LCM explicitly, by the default,
-- rather than by accident.
DROP FUNCTION IF EXISTS next_emp_no();

-- ── 2. The EXCO rule only watched UPDATE ─────────────────────────────────
-- 191 put the check on BEFORE UPDATE, reasoning about a voucher's status
-- moving. A voucher can also arrive already approved — nothing stops an INSERT
-- with status APPROVED, and the bulk paths build rows directly. The rule would
-- simply not have run.
--
-- The same function serves both. On INSERT there is no OLD row, so the
-- "did the status actually change" guard has to tolerate its absence: TG_OP
-- tells them apart rather than a NULL check on OLD, which in a trigger function
-- is a runtime error rather than a false.
CREATE OR REPLACE FUNCTION require_exco_for_non_payroll_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.claim_category IS NULL
     OR NEW.status NOT IN ('APPROVED', 'PAID') THEN
    RETURN NEW;
  END IF;

  -- On UPDATE, only when the status is what changed: re-saving an already
  -- approved voucher is not a second approval and should not be blocked by a
  -- rule about approving.
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF is_lcm_payroll(NEW.applicant_email) THEN
    RETURN NEW;
  END IF;

  IF COALESCE(TRIM(NEW.exco_resolution_ref), '') = ''
     OR COALESCE(TRIM(NEW.project), '') = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'check_violation',
      MESSAGE = format(
        '%s is not on LCM payroll, so this claim is not an entitlement and needs the EXCO behind it: %s',
        NEW.applicant_email,
        CASE
          WHEN COALESCE(TRIM(NEW.project), '') = ''
           AND COALESCE(TRIM(NEW.exco_resolution_ref), '') = ''
            THEN 'record the project and the EXCO resolution reference first'
          WHEN COALESCE(TRIM(NEW.project), '') = ''
            THEN 'record the project it belongs to first'
          ELSE 'record the EXCO resolution reference first'
        END);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_exco_for_non_payroll_claim ON pvs;
CREATE TRIGGER trg_require_exco_for_non_payroll_claim
  BEFORE INSERT OR UPDATE ON pvs
  FOR EACH ROW EXECUTE FUNCTION require_exco_for_non_payroll_claim();

SELECT (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
         WHERE n.nspname = 'public' AND p.proname = 'next_emp_no')            AS next_emp_no_versions,
       (SELECT string_agg(tgtype::int::text, ',') FROM pg_trigger
         WHERE tgrelid = 'pvs'::regclass
           AND tgname = 'trg_require_exco_for_non_payroll_claim')            AS trigger_type,
       (SELECT next_emp_no())                                                AS lcm_next,
       (SELECT next_emp_no((SELECT id FROM payroll_employers WHERE code='TRUSTEES'))) AS trustees_next;
