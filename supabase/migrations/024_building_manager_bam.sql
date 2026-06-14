-- 024: Building/Event Manager role + BAM PV type

-- 1. Extend role check constraint to include BUILDING_MANAGER
ALTER TABLE user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE user_roles ADD CONSTRAINT user_roles_role_check
  CHECK (role IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','BUILDING_MANAGER','STAFF'
  ));

-- 2. Update switch_own_role to allow BUILDING_MANAGER (for role switcher)
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
  SELECT email INTO caller_email FROM auth.users WHERE id = auth.uid();
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF new_role NOT IN (
    'FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
    'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
    'MINISTRY_HEAD','BUILDING_MANAGER','STAFF'
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
    SET role       = EXCLUDED.role,
        ministries = EXCLUDED.ministries,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_own_role(TEXT, TEXT[]) TO authenticated;

-- 3. Add pv_type to pvs (LCM = standard, BAM = Building/Event Mgr)
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS pv_type TEXT DEFAULT 'LCM';
