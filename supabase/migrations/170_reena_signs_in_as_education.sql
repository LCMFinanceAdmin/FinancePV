-- 170: give the Education post's address to the person who holds the post.
--
-- "Give Lew Nyak Jin (Reena) access" with education@lcm.org.my refused with
-- "Somebody already signs in with that address." Nobody does. What happened:
--
--   02:30:09.95  user_roles  education@lcm.org.my, "education -", GUEST
--   02:30:10.07  auth.users  education@lcm.org.my, Google metadata "education -"
--   02:50:33     that account signed in
--
-- all today, 20 Nov 2026. The Google Workspace mailbox education@lcm.org.my
-- signed in to the app for the first time, and handle_new_auth_user() did what
-- it does for an address it cannot place: minted a GUEST row named from the
-- Google profile. user_roles.email is unique and the Give-access modal INSERTs,
-- so it came back 23505 and the modal reported the only thing a 23505 can mean
-- — that the address is taken. It is taken by nobody: the row is the mailbox's
-- own unclaimed account.
--
-- That trigger is written to avoid exactly this. Its comment says "An office
-- address — mission@, stewardship@ — resolves to the person who holds the
-- office", and resolve_role_email() does resolve one, through people.user_email
-- / work_email / email. It could not resolve this one: Reena held the Education
-- post from 12 Sep 2026 but had no account at all, and resolve_role_email
-- returns NULL unless the person it finds already has exactly one. A post whose
-- holder has never signed in is precisely the case that falls through.
--
-- So this does not create a second account. It claims the one that exists —
-- same user_roles.id, same auth.users row, same live session — for the person
-- the register already says holds the post:
--
--   person    Lew Nyak Jin (Reena)  65bd97d3-1322-4571-95a7-e36cf659ab95
--             PASTOR, REVEREND, employed, payroll cc24628a, user_email NULL
--   office    Education, grants EXCO_EDUCATION, term from 2026-09-12, open
--   account   education@lcm.org.my, GUEST, "education -"
--
-- Checked before writing this: that address appears in exactly one column in
-- the whole database — this one user_roles row. No notifications, no stored
-- credentials, no role-switch grants, no directory record, no PV, nothing. The
-- GUEST row has no history to lose, which is why claiming it is safe and why
-- deleting and re-inserting it would only churn the id for no gain.
--
-- Two things worth saying plainly, because the migration cannot decide them:
--
--   * This is the address that reaches her pay. my_payroll_employee_id()
--     resolves login -> people.user_email -> payroll_employees, and she is on
--     payroll, so from here whoever signs in as education@lcm.org.my can open
--     My Salary as Reena. That is correct if the mailbox is hers. If it is a
--     shared departmental mailbox, it is not, and her own work address
--     reena.lew@lcm.org.my is already on her record and would do instead.
--   * EXCO_EDUCATION verifies Education spending against its budget. The role
--     is set here rather than left to Offices & Elections because her election
--     was recorded in September, before she had a login for it to land on, and
--     recording it again is not something to ask of the register.

BEGIN;

-- The person, the post and the account, resolved together. Every condition
-- below is part of the key: this can only ever claim an unclaimed GUEST row for
-- the named person while she holds the named office and has no login already.
CREATE TEMP TABLE claim ON COMMIT DROP AS
SELECT p.id    AS person_id,
       ur.email AS login,
       o.grants_role AS office_role,
       c.id    AS congregation_id,
       p.hq_department AS designation
  FROM people p
  JOIN office_holdings h ON h.person_id = p.id AND h.term_end IS NULL
  JOIN offices o         ON o.id = h.office_id AND o.grants_role = 'EXCO_EDUCATION'
  JOIN user_roles ur     ON lower(ur.email) = 'education@lcm.org.my'
  LEFT JOIN congregations c ON c.name = 'Rawang Lutheran Church'
 WHERE p.id = '65bd97d3-1322-4571-95a7-e36cf659ab95'
   AND p.full_name = 'Lew Nyak Jin (Reena)'
   AND p.user_email IS NULL
   AND ur.role = 'GUEST'
   -- Nobody has claimed it in the meantime.
   AND NOT EXISTS (SELECT 1 FROM people q
                    WHERE lower(COALESCE(q.user_email, '')) = lower(ur.email))
   -- And it has gained nothing since this was checked.
   AND NOT EXISTS (SELECT 1 FROM user_security_credentials x
                    WHERE lower(x.email) = lower(ur.email))
   AND NOT EXISTS (SELECT 1 FROM role_switch_grants x
                    WHERE lower(x.user_email) = lower(ur.email));

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM claim;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 account to claim, found %. Either somebody has since signed in as education@lcm.org.my, or Reena already has a login, or she no longer holds the Education post — check before forcing this.', n;
  END IF;
END $$;

-- 1. The account stops being the mailbox's and becomes hers: her name on it,
--    the role her post grants, and the two facts the Give-access form would
--    have set — employed by LCM, and a pastor, with the congregation that
--    implies.
UPDATE user_roles ur SET
  full_name      = 'Lew Nyak Jin (Reena)',
  role           = c.office_role,
  is_lcm_staff   = TRUE,
  is_pastor      = TRUE,
  congregation_id = c.congregation_id,
  designation    = COALESCE(ur.designation, c.designation),
  reports_to     = COALESCE(ur.reports_to, 'GM_AND_BISHOP'),
  updated_at     = NOW()
  FROM claim c
 WHERE lower(ur.email) = lower(c.login);

-- 2. Tie the account to the directory record, which is what makes the profile
--    and the login one person from here on — and what lets
--    resolve_role_email() place this address next time rather than minting
--    another guest beside it.
UPDATE people p SET
  user_email = c.login,
  updated_at = NOW()
  FROM claim c
 WHERE p.id = c.person_id;

-- Fail rather than half-finish: a role set on an account that the directory
-- does not point at is the state this migration exists to get out of.
DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n
    FROM people p
    JOIN user_roles ur ON lower(ur.email) = lower(p.user_email)
   WHERE p.id = '65bd97d3-1322-4571-95a7-e36cf659ab95'
     AND lower(p.user_email) = 'education@lcm.org.my'
     AND ur.role = 'EXCO_EDUCATION'
     AND ur.full_name = 'Lew Nyak Jin (Reena)';
  IF n <> 1 THEN
    RAISE EXCEPTION 'The account and the directory record did not end up agreeing. Nothing has been changed.';
  END IF;
END $$;

-- What this leaves: one account, hers, with the post it carries.
SELECT ur.email, ur.full_name, ur.role, ur.is_lcm_staff, ur.is_pastor,
       cg.name AS congregation,
       p.full_name AS directory_record,
       (SELECT count(*) FROM user_roles x WHERE x.role = 'GUEST') AS guest_logins_left
  FROM user_roles ur
  JOIN people p ON lower(p.user_email) = lower(ur.email)
  LEFT JOIN congregations cg ON cg.id = ur.congregation_id
 WHERE lower(ur.email) = 'education@lcm.org.my';

COMMIT;
