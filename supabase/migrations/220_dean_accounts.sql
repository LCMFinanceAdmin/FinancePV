-- 220: accounts for the six Deans, before they sign in rather than after.
--
-- Since 219 an address the church does not know becomes a Guest. That is right
-- for a stranger and wrong for a Dean: a guest is held off leave, salary and
-- loans, and these six are pastors employed by LCM who also sign other
-- pastors' leave. Left alone, each would sign in, land as a guest, and have to
-- be found and corrected by hand — and in the meantime their district's
-- pastors would have leave sitting in a queue nobody could clear.
--
-- Settings -> Access & Roles only updates rows that already exist, so there is
-- no screen that can do this. Hence a migration.
--
-- There is no DEAN role and there should not be one. Leading a district is
-- recorded in districts.dean_email, and lib/user-profile.ts derives isDean
-- from it, so the office cannot contradict the district record. What is set
-- here is only what a Dean is underneath: a pastor on the payroll.
--
-- Every value comes from the church's own records rather than from me:
--   full_name   people.full_name, matched on the address in districts
--   is_pastor   people.category = 'PASTOR' for all six
--   role        STAFF, which is what a pastor holding no other office has
--   is_lcm_staff  not set here at all — derive_is_lcm_staff() reads it from
--                 payroll on insert, which is the only honest source
--
-- Nothing is guessed, and designation is deliberately left alone: what a
-- member of clergy is called is not derivable, and inventing one would put
-- words in their mouth on a printed leave form.

INSERT INTO user_roles (email, full_name, role, is_pastor)
SELECT lower(d.dean_email), p.full_name, 'STAFF', TRUE
FROM districts d
JOIN LATERAL (
  SELECT pp.full_name
  FROM people pp
  WHERE lower(d.dean_email) IN (
          lower(COALESCE(pp.user_email, '')),
          lower(COALESCE(pp.work_email, '')),
          lower(COALESCE(pp.email, ''))
        )
    AND pp.category = 'PASTOR'
    AND pp.status = 'ACTIVE'
  LIMIT 1
) p ON TRUE
WHERE d.dean_email IS NOT NULL AND d.dean_email <> ''
ON CONFLICT (email) DO UPDATE
  SET is_pastor = TRUE,
      full_name = COALESCE(NULLIF(user_roles.full_name, ''), EXCLUDED.full_name),
      -- Only lift an account that fell to the guest default. A role somebody
      -- chose deliberately is not ours to overwrite from a migration.
      role = CASE WHEN user_roles.role = 'GUEST' THEN 'STAFF' ELSE user_roles.role END;
