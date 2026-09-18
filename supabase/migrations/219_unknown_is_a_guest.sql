-- 219: somebody the church does not know is a guest, not a member of staff.
--
-- Migration 014 put a trigger on auth.users that gives every new account a
-- user_roles row with role STAFF, and the column default says STAFF as well.
-- So signing in has never granted nothing: it has granted STAFF, which may
-- raise payment vouchers and, until 218, could read the church's banking.
--
-- lib/user-profile.ts carries a comment saying this was closed —
--
--     Falling back to STAFF was the problem: an address nobody has ever heard
--     of authenticated, defaulted to STAFF, and STAFF may raise payment
--     vouchers. [...] the layout turns the session away before any of it is
--     reached.
--
-- and the guard it describes is real: the app layout sends anybody with no
-- user_roles row to /no-access. But the trigger means there is always a row,
-- so the guard has never fired for a new account. The application was fixed
-- and the database was not, which is the failure mode application-layer
-- security has.
--
-- Both now say GUEST. A stranger who signs in can raise a claim their
-- ministry's EXCO must verify, and read the church's structure. That is the
-- floor the church has chosen, and it is a floor rather than a hole: 218
-- shuts guests out of the banking, the payroll, the documents and everybody
-- else's requests, and 217 keeps them off leave, salary and loans.
--
-- What this costs: somebody who ought to be staff now arrives as a guest and
-- stays one until HQ sets their role under Settings -> Access & Roles. That
-- page only ever updates an existing row, so the row being created on first
-- sign-in is what makes HQ's job possible at all — the order is sign in
-- first, then be given a role, which is the opposite of what the handbook
-- said before this.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (email, full_name, role)
  VALUES (
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'GUEST'
  )
  -- A row already there means HQ has been in first, or the person has signed
  -- in before. Either way theirs is the better answer.
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$;

-- The same answer for anything that inserts without naming a role.
ALTER TABLE user_roles ALTER COLUMN role SET DEFAULT 'GUEST';

-- Existing accounts are left exactly as they are. The three STAFF rows on
-- lcm.org.my belong to people the church knows; changing them from here would
-- be guessing at who they are.
