-- 027: Security-definer RPC for Finance Admin to assign/remove ministry heads
-- Bypasses RLS so Finance Admin can write to other users' rows in user_roles.
-- Also inserts the two missing ministries.

INSERT INTO ministries (name)
VALUES ('Building Asset Management (BAM)'), ('Education Desk')
ON CONFLICT (name) DO NOTHING;

CREATE OR REPLACE FUNCTION assign_ministry_head(
  target_email TEXT,
  ministry_name TEXT,
  action TEXT  -- 'add' | 'remove'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  existing_ministries TEXT[];
  new_ministries TEXT[];
BEGIN
  -- Only Finance Admin may call this
  SELECT role INTO caller_role FROM user_roles WHERE email = (auth.jwt() ->> 'email');
  IF caller_role NOT IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2') THEN
    RETURN jsonb_build_object('error', 'Finance Admin only');
  END IF;

  IF action = 'add' THEN
    SELECT ministries INTO existing_ministries FROM user_roles WHERE email = target_email;
    IF NOT FOUND THEN
      -- Pre-create row for users who haven't signed in yet
      INSERT INTO user_roles (email, role, ministries, full_name)
      VALUES (target_email, 'MINISTRY_HEAD', ARRAY[ministry_name], target_email);
    ELSE
      IF existing_ministries IS NOT NULL AND ministry_name = ANY(existing_ministries) THEN
        RETURN jsonb_build_object('error', 'Already assigned to this ministry');
      END IF;
      new_ministries := COALESCE(existing_ministries, ARRAY[]::TEXT[]) || ministry_name;
      UPDATE user_roles
        SET role = 'MINISTRY_HEAD', ministries = new_ministries
        WHERE email = target_email;
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF action = 'remove' THEN
    SELECT ministries INTO existing_ministries FROM user_roles WHERE email = target_email;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'User not found');
    END IF;
    SELECT ARRAY(
      SELECT unnest(COALESCE(existing_ministries, ARRAY[]::TEXT[]))
      EXCEPT SELECT ministry_name
    ) INTO new_ministries;
    UPDATE user_roles SET ministries = new_ministries WHERE email = target_email;
    RETURN jsonb_build_object('ok', true);

  ELSE
    RETURN jsonb_build_object('error', 'Invalid action — use add or remove');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_ministry_head(TEXT, TEXT, TEXT) TO authenticated;
