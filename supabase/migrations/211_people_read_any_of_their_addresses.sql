-- 211: your own directory row, whichever address you signed in with.
--
-- people_read lets somebody read their own row when their sign-in address
-- matches user_email. That was true when an account had one address. It is not
-- any more: 207 and 208 let a person sign in with their office account, their
-- work address or their personal one, and all three resolve to the same
-- account — but only one of them resolves to their own directory row.
--
-- Eddie Kwan signing in as kpkwan63@gmail.com, or Eric Mau as
-- eric.mau@lcm.org.my rather than the Mission office account, could not read
-- the record that is about them. Nothing crashed; their preferred name simply
-- did not apply, so the app called Chan Mun Kwan by a derived name instead of
-- "Rev Chan" — silently, and only for people who came in the other door.
--
-- Still their own row and no one else's: the three addresses are the ones on
-- that same record.

DROP POLICY IF EXISTS people_read ON people;

CREATE POLICY people_read ON people
  FOR SELECT
  USING (
    can_manage_people()
    OR lower(COALESCE(user_email, '')) = lower(auth.jwt() ->> 'email')
    OR lower(COALESCE(work_email, '')) = lower(auth.jwt() ->> 'email')
    OR lower(COALESCE(email, ''))      = lower(auth.jwt() ->> 'email')
  );

SELECT pg_get_expr(polqual, polrelid) AS people_read_now
  FROM pg_policy WHERE polrelid='people'::regclass AND polname='people_read';
