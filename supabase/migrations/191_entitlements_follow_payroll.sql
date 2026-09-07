-- 191: LCM entitlements follow LCM payroll, and everything else goes to EXCO.
--
-- The rule, from the Finance Executive: anyone not on LCM payroll gets no LCM
-- claim or leave entitlement, and a claim they do make must be approved by the
-- EXCO on a project basis.
--
-- What the app did instead was read people.category and nothing else.
-- claim_category_for() maps PASTOR, PARISH_WORKER and HQ_STAFF straight onto
-- the entitlement table, and my_leave_entitlements() computed days for anybody
-- who asked. Neither ever looked at whether LCM actually employs the person.
--
-- That is wrong in a specific way. The directory holds 105 people, 81 of them
-- on payroll. The rest are associated with LCM without being employed by it —
-- pastors and parish workers employed by their own congregation, former
-- pastors, people under a different organisation inside LCM. They carry the
-- category of the work they do, because that is what the category means, and
-- the app read it as a claim on LCM's money.
--
-- Today only two of them can sign in, so this is mostly latent rather than
-- live. It would not have stayed latent: 22 of the 24 have an address recorded
-- ready for an account, user_roles.is_lcm_staff defaults to true and StaffOnly
-- defaults to allowed, so each account created would have arrived holding LCM
-- leave and eight LCM claim entitlements, and nobody would have been told.
--
-- ── Payroll as the test ───────────────────────────────────────────────────
-- One predicate, is_lcm_payroll(), used everywhere the question is asked, so
-- the three places cannot drift apart. An ACTIVE payroll record is the test
-- rather than people.is_employed, which is a flag somebody sets by hand and
-- which already disagrees with payroll on three records. Payroll is the thing
-- that has to be right for someone to be paid at all, so it is the fact worth
-- keying on, and it self-heals: adding a genuine employee to payroll restores
-- their entitlements without anybody remembering a second switch.
--
-- ── Claims still happen; they just are not entitlements ───────────────────
-- A voucher tagged with a claim type, from somebody not on payroll, now cannot
-- reach APPROVED without a project and an EXCO resolution reference. Those two
-- columns have existed since the table was made and are printed on the
-- voucher; nothing had ever required them.
--
-- Scoped deliberately narrowly, to vouchers carrying a claim type. Of the 34
-- vouchers in the system today, every one has claim_category NULL — they are
-- operational payments, the Building Manager paying contractors among them, and
-- not personal claims. Requiring an EXCO resolution for those would stop
-- ordinary work in the name of a rule about personal entitlement. So this
-- changes nothing that exists and governs what comes next.
--
-- Enforced as a trigger rather than in the submit form, because the form is one
-- of several ways a voucher's status moves — the admin-action edge function is
-- another, and edge functions ship separately from the app and have gone stale
-- before. A rule about money belongs where every path has to pass.

-- ── The predicate ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_lcm_payroll(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM people p
      JOIN payroll_employees pe ON pe.person_id = p.id
     WHERE (lower(p.user_email) = lower(p_email)
         OR lower(COALESCE(p.work_email, '')) = lower(p_email))
       AND pe.status = 'ACTIVE'
  );
$$;

COMMENT ON FUNCTION is_lcm_payroll(TEXT) IS
  'Whether LCM employs this address, judged by an active payroll record. The single test behind every LCM employment entitlement — claims, leave, staff loans.';

GRANT EXECUTE ON FUNCTION is_lcm_payroll(TEXT) TO authenticated;

-- ── Claims ────────────────────────────────────────────────────────────────
-- The gate sits here rather than inside claim_category_for(), which answers
-- "what category is this person" and should keep answering it truthfully.
DROP FUNCTION IF EXISTS my_claim_entitlements(INTEGER);

CREATE FUNCTION my_claim_entitlements(p_year INTEGER DEFAULT NULL)
RETURNS TABLE (
  code TEXT, name TEXT, basis TEXT, percent_covered NUMERIC, cap_amount NUMERIC,
  used NUMERIC, remaining NUMERIC, unit_rate NUMERIC, unit_label TEXT,
  source TEXT, note TEXT, scope TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT lower(auth.jwt() ->> 'email') AS email,
           claim_category_for(auth.jwt() ->> 'email') AS category,
           COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT) AS yr,
           is_lcm_payroll(auth.jwt() ->> 'email') AS employed,
           (SELECT p.id FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS person_id,
           (SELECT NULLIF(p.gender, '') FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS gender
  ),
  spent AS (
    SELECT v.claim_category AS code, COALESCE(SUM(v.amount), 0) AS total
      FROM pvs v, me
     WHERE lower(v.applicant_email) = me.email
       AND v.claim_category IS NOT NULL
       AND v.status IN ('APPROVED', 'PAID')
       AND EXTRACT(YEAR FROM v.date)::INT = me.yr
     GROUP BY v.claim_category
  ),
  mine AS (
    SELECT DISTINCT ON (e.claim_code) e.*,
           CASE WHEN e.person_id IS NOT NULL THEN 'PERSONAL' ELSE 'CATEGORY' END AS scope
      FROM claim_entitlements e, me
     WHERE e.active
       AND me.employed
       AND (e.person_id = me.person_id OR e.person_category = me.category)
     ORDER BY e.claim_code, (e.person_id IS NULL)
  )
  SELECT ct.code, ct.name, m.basis, m.percent_covered, m.cap_amount,
         CASE WHEN m.basis = 'YEARLY' THEN COALESCE(s.total, 0) ELSE NULL END,
         CASE WHEN m.basis = 'YEARLY' THEN GREATEST(m.cap_amount - COALESCE(s.total, 0), 0) ELSE NULL END,
         ct.unit_rate, ct.unit_label, m.source, m.note, m.scope
    FROM mine m
    JOIN claim_types ct ON ct.code = m.claim_code AND ct.active
    LEFT JOIN spent s ON s.code = ct.code
   WHERE (ct.restricted_to_gender IS NULL
          OR (SELECT gender FROM me) IS NULL
          OR ct.restricted_to_gender = (SELECT gender FROM me))
   ORDER BY ct.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_claim_entitlements(INTEGER) TO authenticated;

-- ── Leave ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS my_leave_entitlements();

CREATE FUNCTION my_leave_entitlements()
RETURNS TABLE (
  code TEXT, days NUMERIC, years_of_service INT, aggregate_with TEXT,
  kind TEXT, min_months_service INT, band_label TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH me AS (
    SELECT auth.jwt() ->> 'email' AS email,
           service_start_for(auth.jwt() ->> 'email') AS started,
           is_lcm_payroll(auth.jwt() ->> 'email') AS employed,
           (SELECT NULLIF(p.gender, '') FROM people p
             WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
                OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
             LIMIT 1) AS gender
  ),
  yrs AS (
    SELECT CASE WHEN started IS NULL THEN NULL
                ELSE EXTRACT(YEAR FROM age(CURRENT_DATE, started))::INT END AS n
      FROM me
  ),
  band_count AS (
    SELECT leave_type_code, count(*) AS n
      FROM leave_entitlement_bands GROUP BY leave_type_code
  )
  SELECT lt.code,
         leave_entitlement(lt.code, (SELECT email FROM me)),
         (SELECT n FROM yrs),
         lt.aggregate_with,
         CASE
           WHEN bc.n IS NOT NULL      THEN 'BANDED'
           WHEN lt.is_replacement     THEN 'EARNED'
           WHEN COALESCE(lt.days_per_year, 0) > 0 THEN 'FIXED'
           ELSE 'AS_NEEDED'
         END,
         lt.min_months_service,
         CASE WHEN COALESCE(bc.n, 0) < 2 THEN NULL ELSE (
           SELECT CASE
                    WHEN b.max_years IS NULL THEN b.min_years || ' years and over'
                    WHEN b.min_years = 0     THEN 'up to ' || b.max_years || ' years'
                    ELSE b.min_years || ' to ' || b.max_years || ' years'
                  END
             FROM leave_entitlement_bands b
            WHERE b.leave_type_code = lt.code
              AND (SELECT n FROM yrs) IS NOT NULL
              AND (SELECT n FROM yrs) >= b.min_years
              AND (b.max_years IS NULL OR (SELECT n FROM yrs) <= b.max_years)
            ORDER BY b.min_years DESC LIMIT 1) END
    FROM leave_types lt
    LEFT JOIN band_count bc ON bc.leave_type_code = lt.code
   WHERE lt.active
     -- LCM leave is LCM employment. Nothing else here matters if this is false.
     AND (SELECT employed FROM me)
     -- Fails open on gender: no restriction, or none on file, and it is offered.
     AND (lt.restricted_to_gender IS NULL
          OR (SELECT gender FROM me) IS NULL
          OR lt.restricted_to_gender = (SELECT gender FROM me))
   ORDER BY lt.sort_order;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;

-- ── The account flag the pages read ───────────────────────────────────────
-- StaffOnly reads user_roles.is_lcm_staff to decide whether My Leave and My
-- Loan render at all. It was set by hand and had drifted. Derived now, and kept
-- derived, so it cannot disagree with the functions above.
CREATE OR REPLACE FUNCTION sync_account_from_person()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    RETURN NEW;
  END IF;

  UPDATE user_roles u
     SET is_pastor       = (NEW.category = 'PASTOR' OR NEW.ordination IS NOT NULL),
         congregation_id = COALESCE(NEW.congregation_id, u.congregation_id),
         full_name       = COALESCE(NULLIF(trim(NEW.full_name), ''), u.full_name),
         is_lcm_staff    = is_lcm_payroll(NEW.user_email),
         updated_at      = NOW()
   WHERE lower(u.email) = lower(NEW.user_email);

  RETURN NEW;
END;
$$;

-- The other direction: joining, leaving or being linked to payroll has to
-- reach the account too, or the flag only updates when somebody happens to
-- edit the directory record.
CREATE OR REPLACE FUNCTION sync_account_from_payroll()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person UUID := COALESCE(NEW.person_id, OLD.person_id);
BEGIN
  UPDATE user_roles u
     SET is_lcm_staff = is_lcm_payroll(u.email),
         updated_at   = NOW()
    FROM people p
   WHERE p.id = v_person
     AND (lower(u.email) = lower(COALESCE(p.user_email, ''))
       OR lower(u.email) = lower(COALESCE(p.work_email, '')));

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_from_payroll ON payroll_employees;
CREATE TRIGGER trg_sync_account_from_payroll
  AFTER INSERT OR UPDATE OF person_id, status OR DELETE ON payroll_employees
  FOR EACH ROW EXECUTE FUNCTION sync_account_from_payroll();

UPDATE user_roles u SET is_lcm_staff = is_lcm_payroll(u.email), updated_at = NOW()
 WHERE u.is_lcm_staff IS DISTINCT FROM is_lcm_payroll(u.email);

-- ── A claim from outside payroll needs the EXCO behind it ─────────────────
CREATE OR REPLACE FUNCTION require_exco_for_non_payroll_claim()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only on the move into approval, and only for a voucher claiming against a
  -- claim type. An operational payment is not a personal claim and is none of
  -- this rule's business.
  IF NEW.claim_category IS NULL
     OR NEW.status NOT IN ('APPROVED', 'PAID')
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
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
  BEFORE UPDATE ON pvs
  FOR EACH ROW EXECUTE FUNCTION require_exco_for_non_payroll_claim();

SELECT (SELECT count(*) FROM user_roles WHERE is_lcm_staff)          AS accounts_on_payroll,
       (SELECT count(*) FROM user_roles WHERE NOT is_lcm_staff)      AS accounts_not_on_payroll,
       (SELECT count(*) FROM pvs WHERE claim_category IS NOT NULL)   AS claim_tagged_vouchers,
       (SELECT count(*) FROM people p JOIN payroll_employees pe
          ON pe.person_id = p.id AND pe.status = 'ACTIVE')           AS people_on_payroll,
       (SELECT count(*) FROM people)                                 AS people_total;
