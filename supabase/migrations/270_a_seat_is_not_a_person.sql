-- 270: the Education seat stops carrying Reena's personal records.
--
-- 267 put Reena on education@lcm.org.my by setting people.user_email, which is
-- how the app ties a login to a directory record. It said at the time that this
-- is the address that reaches her pay, and that it would be wrong if the
-- mailbox were a shared departmental one. It is. education@lcm.org.my is an
-- office seat: it is appointed to whoever holds the Education portfolio, so
-- that the portfolio can approve. It is not Reena.
--
-- Five functions resolve a signed-in address to a person through
-- people.user_email, and between them they are the whole of the personal
-- surface:
--
--   my_payroll_employee_id   payslips
--   my_leave_entitlements    leave
--   my_claim_entitlements    personal allowances
--   my_employer              who employs them
--   my_verifier_scopes       delegations made to them personally
--
-- So while that column said education@lcm.org.my, anyone holding the Education
-- mailbox could open EMP-034's payslips and her leave. That is the exposure
-- this closes, and it closes by moving one column — no policy changes, because
-- the policies were never wrong.
--
-- The rule, as the church states it: a ministry @lcm.org.my address is
-- appointed to the EXCO approval functions and nothing else. A person's
-- confidential records belong to their own address. For Reena that is
-- reena.lew@lcm.org.my, already on her record as work_email. Joel and Linda do
-- not have this problem because they are not employed by LCM and have no
-- payslip or leave to expose; their seats are correct as they stand.
--
-- After this:
--
--   education@lcm.org.my   EXCO_EDUCATION, ministries {Education}. Approves
--                          Education spending. Reaches no payroll, no leave,
--                          no entitlements, and no directory record.
--   reena.lew@lcm.org.my   STAFF, employed, pastor, Rawang. Her payslips, her
--                          leave, her claims. Tied to her directory record.
--
-- The three flags being cleared from the seat were set by 267 and are personal
-- facts, not seat facts: is_lcm_staff and is_pastor drive the employment
-- surfaces (components/auth/staff-only.tsx guards leave and staff loans by
-- them), so a seat carrying them would still offer My Salary and My Leaves and
-- land on an empty page. Every other EXCO seat held by a non-employee —
-- scc@, stewardship@, swm@ — already has all three off. This makes Education
-- match.
--
-- NOT done here, and worth a decision separately:
--
--   * finance@lcm.org.my carries EMP-001 the same way, from 158. If that
--     mailbox is shared, Jermaine's own payslips are reachable from it. It is
--     his own working address rather than a portfolio seat, so it is left
--     exactly as it is.
--   * eric.mau@lcm.org.my holds EXCO_MISSION on a personal address, where the
--     church's rule would put it on mission@. Out of scope here.
--
-- Reena keeps working throughout: her EXCO approval rights live on the seat's
-- user_roles row, which this does not touch. What she cannot do until the
-- Google account reena.lew@lcm.org.my exists and she signs in once is open her
-- own payslip — that account has no auth.users row yet, so it has to be created
-- in Workspace. The user_roles row is made here so that when she does sign in,
-- handle_new_auth_user() finds her waiting and does not mint her a GUEST.

BEGIN;

CREATE TEMP TABLE move ON COMMIT DROP AS
SELECT p.id            AS person_id,
       p.full_name     AS person,
       'education@lcm.org.my'::text AS seat,
       lower(btrim(p.work_email))   AS personal_login,
       ur.congregation_id           AS congregation_id
  FROM people p
  JOIN user_roles ur ON lower(ur.email) = 'education@lcm.org.my'
 WHERE p.id = '65bd97d3-1322-4571-95a7-e36cf659ab95'
   AND p.full_name = 'Lew Nyak Jin (Reena)'
   AND lower(p.user_email) = 'education@lcm.org.my'
   AND lower(btrim(COALESCE(p.work_email, ''))) = 'reena.lew@lcm.org.my'
   AND ur.role = 'EXCO_EDUCATION';

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM move;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 record to move, found %. Either the seat is no longer EXCO_EDUCATION, or Reena is no longer on it, or her work address has changed — check before forcing this.', n;
  END IF;
END $$;

-- 1. Her own account, so there is somewhere for the records to go. STAFF:
--    submits vouchers and claims, approves nothing. Her approving is done from
--    the seat, which is the whole point of keeping the two apart.
INSERT INTO user_roles (email, full_name, role, is_lcm_staff, is_pastor,
                        congregation_id, reports_to)
SELECT m.personal_login, m.person, 'STAFF', TRUE, TRUE, m.congregation_id,
       'GM_AND_BISHOP'
  FROM move m
 WHERE NOT EXISTS (SELECT 1 FROM user_roles u
                    WHERE lower(u.email) = m.personal_login);

-- 2. The directory record follows the person, not the seat. This one column is
--    the whole of the exposure and the whole of the fix.
UPDATE people p SET
  user_email = m.personal_login,
  updated_at = NOW()
  FROM move m
 WHERE p.id = m.person_id;

-- 3. The seat stops claiming to be an employee and a pastor. Its role and its
--    portfolio are deliberately untouched — Education still approves Education.
UPDATE user_roles ur SET
  is_lcm_staff    = FALSE,
  is_pastor       = FALSE,
  congregation_id = NULL,
  updated_at      = NOW()
  FROM move m
 WHERE lower(ur.email) = m.seat;

-- 4. The thing that has to be true: nothing reaches a person from the seat.
DO $$
DECLARE leaks INT; landed INT;
BEGIN
  SELECT count(*) INTO leaks FROM people
   WHERE lower(COALESCE(user_email, '')) = 'education@lcm.org.my';
  IF leaks <> 0 THEN
    RAISE EXCEPTION '% directory record(s) still answer to the Education seat. Nothing has been changed.', leaks;
  END IF;

  SELECT count(*) INTO landed
    FROM people p
    JOIN user_roles ur ON lower(ur.email) = lower(p.user_email)
   WHERE p.id = '65bd97d3-1322-4571-95a7-e36cf659ab95'
     AND lower(p.user_email) = 'reena.lew@lcm.org.my'
     AND ur.is_lcm_staff;
  IF landed <> 1 THEN
    RAISE EXCEPTION 'Her records did not land on her own account. Nothing has been changed.';
  END IF;
END $$;

-- Seat on the left, person on the right, and nothing crossing over.
SELECT ur.email, ur.role, ur.is_lcm_staff, ur.is_pastor, ur.ministries,
       (SELECT count(*) FROM people p WHERE lower(COALESCE(p.user_email,'')) = lower(ur.email))
         AS directory_records,
       (SELECT count(*) FROM payroll_employees pe
          JOIN people p ON p.id = pe.person_id
         WHERE lower(COALESCE(p.user_email,'')) = lower(ur.email)) AS payslips_reachable,
       (SELECT count(*) FROM auth.users u WHERE lower(u.email) = lower(ur.email))
         AS google_account_exists
  FROM user_roles ur
 WHERE lower(ur.email) IN ('education@lcm.org.my', 'reena.lew@lcm.org.my')
 ORDER BY ur.email;

COMMIT;
