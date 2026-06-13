-- 014: user_roles housekeeping
-- 1. Add saved_signature column (inline signatures saved per user)
-- 2. Allow authenticated users to upsert their own row (role switcher)
-- 3. Auto-create a STAFF row for new Supabase auth sign-ups

ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS saved_signature TEXT;

-- Back-fill: any auth.users that have no user_roles row get a STAFF row
INSERT INTO user_roles (email, full_name, role)
SELECT
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', ''),
  'STAFF'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.email = u.email)
ON CONFLICT (email) DO NOTHING;

-- Allow authenticated users to update their own row (role switcher + signature save)
DO $$
BEGIN
  DROP POLICY IF EXISTS "user_roles_own_update" ON user_roles;
  CREATE POLICY "user_roles_own_update" ON user_roles
    FOR UPDATE TO authenticated
    USING   (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
    WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
END $$;

-- Allow authenticated users to insert their own row (upsert from role switcher)
DO $$
BEGIN
  DROP POLICY IF EXISTS "user_roles_own_insert" ON user_roles;
  CREATE POLICY "user_roles_own_insert" ON user_roles
    FOR INSERT TO authenticated
    WITH CHECK (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
END $$;

-- Trigger: auto-create a STAFF user_roles row whenever a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_roles (email, full_name, role)
  VALUES (
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    'STAFF'
  )
  ON CONFLICT (email) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_auth_user();
