-- 221: a guest is a person, not an address.
--
-- 218 asks "is this a guest?" by looking up the address in the JWT. 219 gives
-- any address nobody knows a GUEST row. Put together, those two are wrong for
-- everybody who has more than one address.
--
-- Eric Mau is the case on file. His account is eric.mau@lcm.org.my and carries
-- EXCO_MISSION; the directory records him at mission@lcm.org.my, the office
-- address. resolve_role_email() exists precisely for this and maps the second
-- to the first, which is why lib/user-profile.ts shows him as EXCO Mission
-- whichever he signs in with.
--
-- is_guest() did not resolve anything. So had he signed in as mission@:
--
--   219's trigger sees no row for mission@ and creates one, as GUEST
--   the app resolves mission@ -> eric.mau@ and renders him as EXCO Mission
--   is_guest() looks up mission@, finds GUEST, and returns true
--
-- leaving him an EXCO member on screen and a guest to every policy 218 wrote
-- — his ministry's budgets and requests would come back empty, with nothing
-- on the page to say why. Worse than being turned away, because it looks like
-- the data is gone.
--
-- Both halves are fixed here: is_guest() asks about the person rather than the
-- address they typed, and the trigger stops minting a second row for somebody
-- the church already knows under another name.

CREATE OR REPLACE FUNCTION is_guest()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE lower(ur.email) = lower(COALESCE(
            NULLIF(resolve_role_email(auth.jwt() ->> 'email'), ''),
            auth.jwt() ->> 'email'))
      AND ur.role = 'GUEST'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_guest() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_guest() TO authenticated, service_role;

-- And do not create the second row in the first place.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  known TEXT;
BEGIN
  -- The address this login already belongs to, if the directory knows it
  -- under another name. An office address — mission@, stewardship@ — resolves
  -- to the person who holds the office.
  known := NULLIF(resolve_role_email(NEW.email), '');

  IF EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE lower(ur.email) = lower(COALESCE(known, NEW.email))
  ) THEN
    -- Already somebody here. Adding a guest row beside their real one is how
    -- the person ends up outranked by their own alias.
    RETURN NEW;
  END IF;

  INSERT INTO public.user_roles (email, full_name, role)
  VALUES (
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'GUEST'
  )
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Nothing to clean up: no guest row has been created yet. Left as a note for
-- whoever reads this after one has —
--   SELECT * FROM user_roles ur WHERE ur.role = 'GUEST'
--     AND EXISTS (SELECT 1 FROM user_roles o
--                  WHERE lower(o.email) = lower(resolve_role_email(ur.email))
--                    AND o.role <> 'GUEST');
-- is how you would find an alias that had shadowed a real account.
