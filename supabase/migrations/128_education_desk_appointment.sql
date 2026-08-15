-- 128: Education Desk becomes a desk, not a portfolio.
--
-- Applied to the live database on 2026-08-15 and recorded here, because a
-- change to what a named person may approve should be in the repo rather than
-- only in the database. Written to be safe to re-run.
--
-- Chan Mun Kwan runs the Education Desk under the Education EXCO. He held
-- MINISTRY_HEAD with ministries = {'Education Desk'}, which reads as "EXCO
-- Member" and ranked him alongside portfolio holders. Three changes make the
-- arrangement match reality:

-- 1. The rank. MINISTRY_SUPPORT carries no portfolio of its own; the trigger
--    from 127 clears the one that came with the old role.
UPDATE user_roles
   SET role = 'MINISTRY_SUPPORT'
 WHERE email = 'educationdesk@lcm.org.my'
   AND role = 'MINISTRY_HEAD';

-- 2. The authority, now delegated rather than owned — visible on the Education
--    portfolio, withdrawable, and recorded on each voucher he verifies as
--    signed on the ministry's behalf.
--
--    Whole ministry rather than the "Education Desk Project" budget line alone.
--    That looks like the narrower and tidier choice and would have been a
--    demotion: his old scope reached all of Education through the desk/parent
--    mapping in lib/ministries.ts, and Education's vouchers carry project names
--    like "Lay Leaders Training" rather than the budget line's own name, so a
--    single-line scope would have cut him off from the work he actually does.
--    Narrowing it later is a tick-box on the delegation.
INSERT INTO ministry_verifiers (ministry, person_id, projects, granted_by, note)
SELECT 'Education',
       p.id,
       '{}',
       'finance@lcm.org.my',
       'Appointed to run the Education Desk. Recorded by Finance while the Education EXCO seat is vacant.'
  FROM people p
 WHERE lower(p.user_email) = 'educationdesk@lcm.org.my'
   AND NOT EXISTS (
     SELECT 1 FROM ministry_verifiers v
      WHERE lower(v.ministry) = 'education' AND v.person_id = p.id AND v.active
   );

-- 3. The post itself. Without this the first two undo themselves: the next
--    election on Education Desk would grant MINISTRY_HEAD again.
UPDATE offices
   SET grants_role = 'MINISTRY_SUPPORT'
 WHERE name = 'Education Desk'
   AND grants_role = 'MINISTRY_HEAD';

-- When the Education EXCO seat is filled, the holder should re-grant the
-- delegation so the record shows the EXCO delegated it rather than Finance.
-- Same effect, but it is the arrangement the church actually described.
