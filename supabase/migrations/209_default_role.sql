-- 209: a role you can come back to.
--
-- finance@lcm.org.my is the Finance Executive. It is also the developer's
-- account, with a role-switch grant for all eleven roles, and that is the whole
-- problem: switch_own_role overwrites the role column in place, so the moment
-- it is used to test something the account's own role is gone. There is nothing
-- to return to and nothing that remembers what it was.
--
-- That is how the account came to be sitting at GENERAL_MANAGER. 198 set it
-- back to FINANCE_ADMIN and a later switch overwrote that too. Today's audit
-- then read the live data honestly and reported that the church has no Finance
-- Executive and two General Managers, which was true of the database and false
-- of the church.
--
-- So the base role becomes a thing the row remembers. Switching still rewrites
-- `role`, because everything downstream reads that and should keep doing so —
-- a switched session is meant to be indistinguishable from the real role, which
-- is the point of testing with it. But `default_role` holds who the account
-- actually belongs to, and going back is one call rather than an act of memory.

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS default_role TEXT;

COMMENT ON COLUMN user_roles.default_role IS
  'The role this account really holds, kept so a role switch can be undone. Null means the account has never switched and `role` is its own.';

-- Anybody holding a switch grant has a role worth preserving, and for all but
-- one of them it is still intact. Record it before the next switch loses it.
UPDATE user_roles u
   SET default_role = u.role::text
 WHERE u.default_role IS NULL
   AND EXISTS (SELECT 1 FROM role_switch_grants g WHERE lower(g.user_email) = lower(u.email));

-- Except this one, which has already been lost. The General Manager has said
-- what it is.
UPDATE user_roles
   SET default_role = 'FINANCE_ADMIN',
       role         = 'FINANCE_ADMIN',
       ministries   = ARRAY[]::TEXT[],
       updated_at   = NOW()
 WHERE email = 'finance@lcm.org.my';

-- Capture the base role on the way out, if it was never captured.
CREATE OR REPLACE FUNCTION switch_own_role(new_role TEXT, new_ministries TEXT[] DEFAULT '{}'::TEXT[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  permitted_ministries TEXT[];
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT grants.ministries INTO permitted_ministries
  FROM role_switch_grants grants
  WHERE grants.user_email = caller_email
    AND grants.role = new_role
    AND (grants.expires_at IS NULL OR grants.expires_at > NOW());

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No active role-switch grant for %', new_role;
  END IF;

  IF is_exco_role(new_role)
     AND cardinality(new_ministries) > 0
     AND NOT ('*' = ANY(permitted_ministries))
     AND NOT (new_ministries <@ permitted_ministries) THEN
    RAISE EXCEPTION 'Ministry selection is outside your role-switch grant';
  END IF;

  UPDATE user_roles
  SET default_role = COALESCE(default_role, role::text),
      role = new_role,
      ministries = CASE WHEN is_exco_role(new_role) THEN new_ministries ELSE '{}'::TEXT[] END,
      updated_at = NOW()
  WHERE email = caller_email;
END;
$$;

-- And the way back. No grant is needed to stop pretending to be somebody else.
CREATE OR REPLACE FUNCTION revert_to_default_role()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  home         TEXT;
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT u.default_role INTO home FROM user_roles u WHERE u.email = caller_email;
  IF home IS NULL THEN RAISE EXCEPTION 'This account has no role to return to'; END IF;

  UPDATE user_roles
  SET role = home,
      ministries = CASE WHEN is_exco_role(home) THEN ministries ELSE ARRAY[]::TEXT[] END,
      updated_at = NOW()
  WHERE email = caller_email;

  RETURN home;
END;
$$;

GRANT EXECUTE ON FUNCTION revert_to_default_role() TO authenticated;

SELECT u.email, u.role::text AS now_holding, COALESCE(u.default_role,'(never switched)') AS belongs_to
  FROM user_roles u
 WHERE u.default_role IS NOT NULL OR EXISTS (SELECT 1 FROM role_switch_grants g WHERE lower(g.user_email)=lower(u.email))
 ORDER BY u.email;
