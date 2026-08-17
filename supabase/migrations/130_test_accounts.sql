-- 130: two test accounts that hold the real roles.
--
-- The ask was for a "Test Treasurer" and a "Test EXCO Education" role. A new
-- role KEY would have been the wrong shape, and 126 already explains why: role
-- names are written into RLS policies and edge functions, TREASURER alone in 97
-- places. A TEST_TREASURER key would appear in every picker and grant nothing —
-- no queue would list its work, no approval would accept its signature. Making
-- it genuinely equivalent means editing all 97 and then remembering both keys
-- in every permission check written from here on, forever.
--
-- None of that is necessary, because signing resolves by ROLE, not by person:
--
--   if (plan.required === 1) return officerApprovals.some(a => a.role === 'TREASURER')
--
-- `.some`, not "all". A second account holding the real TREASURER role is
-- therefore treated identically to the first, adds no extra required signature,
-- and cannot drift out of step with it — because it is not a copy of the role,
-- it is the role.
--
-- So these are test PEOPLE holding real roles, not test roles.
--
--   Test Treasurer        TREASURER
--   Test EXCO Education   MINISTRY_HEAD + Education
--
-- Education is an EXCO office granting MINISTRY_HEAD, and expandMinistries()
-- links it both ways with Education Desk, so this account covers exactly what
-- the real Education EXCO member covers — including the Desk.

ALTER TABLE user_roles
  ADD COLUMN IF NOT EXISTS is_test_account BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN user_roles.is_test_account IS
  'A test identity. Holds a real role with real permissions — the flag drives the warning banner, it does not restrict anything.';

-- ── The two accounts ──────────────────────────────────────────────────────
-- The addresses are deliberately unset, to be filled in from Access & Roles.
--
-- They cannot be left literally blank: email is UNIQUE NOT NULL and is the key
-- the whole app joins on. `.invalid` is the next best thing and is arguably
-- better — RFC 2606 reserves the TLD permanently, so it resolves nowhere. No
-- magic link can be delivered to it and nobody can sign in as one of these
-- until a real address is set, which makes the placeholder fail safe rather
-- than merely look unused.
INSERT INTO user_roles (email, full_name, role, ministries, is_lcm_staff, designation, is_test_account)
VALUES
  ('test-treasurer@unset.invalid',      'Test Treasurer',      'TREASURER',     '{}',            TRUE, 'Test account', TRUE),
  ('test-exco-education@unset.invalid', 'Test EXCO Education', 'MINISTRY_HEAD', '{Education}',   TRUE, 'Test account', TRUE)
ON CONFLICT (email) DO NOTHING;

-- is_lcm_staff is TRUE so the test accounts see the widest surface — My Leaves
-- and My Loan included. Untick it on either one to test how the app looks to a
-- volunteer EXCO member instead.
