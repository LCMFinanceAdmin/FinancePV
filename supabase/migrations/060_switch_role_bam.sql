-- 060: allow switching into the BAM roles via switch_own_role.
-- The role whitelist in 017 predates the Building/Event Manager and BAM
-- Committee roles, so the test role switcher rejected them with
-- "Invalid role: BAM_COMMITTEE". Add both to the allowed set.

CREATE OR REPLACE FUNCTION public.switch_own_role(
  new_role       TEXT,
  new_ministries TEXT[] DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF new_role NOT IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','BUILDING_MANAGER','BAM_COMMITTEE','STAFF'
  ) THEN
    RAISE EXCEPTION 'Invalid role: %', new_role;
  END IF;

  INSERT INTO public.user_roles (email, role, ministries, updated_at)
  VALUES (
    caller_email,
    new_role,
    CASE WHEN new_role = 'MINISTRY_HEAD' THEN new_ministries ELSE '{}' END,
    NOW()
  )
  ON CONFLICT (email) DO UPDATE
    SET role        = EXCLUDED.role,
        ministries  = EXCLUDED.ministries,
        updated_at  = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_own_role(TEXT, TEXT[]) TO authenticated;
