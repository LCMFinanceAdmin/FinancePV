-- 017: SECURITY DEFINER function so any authenticated user can switch their
-- own role via supabase.rpc('switch_own_role', ...) from the browser client.
-- Running as the function owner bypasses RLS, so no extra service-role key
-- is needed in the Next.js environment.

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
  -- Resolve caller's email from the JWT uid
  SELECT email INTO caller_email
  FROM auth.users
  WHERE id = auth.uid();

  IF caller_email IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Validate role value against the allowed set
  IF new_role NOT IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','STAFF'
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

-- Grant execute to authenticated role so the browser client can call it
GRANT EXECUTE ON FUNCTION public.switch_own_role(TEXT, TEXT[]) TO authenticated;
