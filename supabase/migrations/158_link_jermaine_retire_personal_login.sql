-- 158: join the payroll record to the right person, and retire the second login.
--
-- The People Directory holds two records named "Jermaine Aaron". They are not
-- two people — both were seeded from user accounts at the same instant
-- (2026-05-06 02:32:37), one per login:
--
--   ACTIVE    finance@lcm.org.my            164 references across 25 columns —
--                                           53 recurring PVs, 26 vouchers
--                                           raised, 26 submitted, payroll,
--                                           budgets, bookings, signature, PIN.
--   INACTIVE  jermaineaaron1991@gmail.com    29 references across 6 — every one
--                                           of them a notification, a switch
--                                           grant, or the account row itself.
--                                           No voucher raised, none approved.
--
-- ── 1. The payroll record belongs to the working identity ─────────────────
-- Left unlinked by migration 157 on purpose: the names do not match
-- ("Jermaine Aaron Jayaraj" on payroll) and the directory never recorded an IC,
-- so matching would have been a guess. Confirmed by hand, so it is written by
-- hand. people.payroll_employee_id and is_employed follow by trigger.
UPDATE payroll_employees
   SET person_id = (SELECT id FROM people
                     WHERE full_name = 'Jermaine Aaron'
                       AND lower(user_email) = 'finance@lcm.org.my')
 WHERE full_name = 'Jermaine Aaron Jayaraj'
   AND person_id IS NULL;

-- ── 2. Retire the personal login ──────────────────────────────────────────
-- The directory record was marked INACTIVE on 2026-08-13 and that did nothing
-- to the access: the login still carried FINANCE_ADMIN and eleven role-switch
-- grants covering every approval seat in the church. people.status and
-- user_roles are different tables with nothing joining them, so the directory
-- said "past" while the account could still sign in and act as the Bishop.
--
-- Recorded here in full, because deleting the row is the only way to take it
-- off the register of logins and this file is then the way back:
--
--   user_roles                 email = jermaineaaron1991@gmail.com
--                              role  = FINANCE_ADMIN
--                              full_name = Jermaine Aaron
--                              is_test_account = false
--   role_switch_grants         11 grants: BAM_COMMITTEE, BISHOP,
--                              BUILDING_MANAGER, FINANCE_ADMIN,
--                              FINANCE_ADMIN_2, FINANCE_ADMIN_3,
--                              GENERAL_MANAGER, MINISTRY_HEAD, SECRETARY,
--                              STAFF, TREASURER
--   user_security_credentials  1 row (PIN / saved signature),
--                              last updated 2026-07-23
--
-- Both child tables cascade from user_roles(email) — see migration 118 — so
-- this one statement removes all three, or none of them.
--
-- What is deliberately NOT touched: the fourteen notifications addressed to
-- that address, and people.email / people.user_email on the INACTIVE record.
-- Those are the record of what happened and who it was; rewriting them would
-- be the orphaning that migration 118 exists to prevent.
DELETE FROM user_roles WHERE lower(email) = 'jermaineaaron1991@gmail.com';
