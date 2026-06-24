-- 056: RPC for Building/Event Manager and Finance Executive to assign or remove
-- the BAM Committee PIC role by email (pre-creates a row for users who haven't
-- signed in yet, so the role applies on their first Google login).

CREATE OR REPLACE FUNCTION assign_bam_committee(
  target_email TEXT,
  action TEXT  -- 'add' | 'remove'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
  em TEXT := lower(trim(target_email));
BEGIN
  SELECT role INTO caller_role FROM user_roles WHERE email = (auth.jwt() ->> 'email');
  IF caller_role NOT IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3', 'BUILDING_MANAGER') THEN
    RETURN jsonb_build_object('error', 'Only Building/Event Manager or Finance Executive may assign the BAM Committee');
  END IF;
  IF em = '' OR em IS NULL THEN
    RETURN jsonb_build_object('error', 'Email is required');
  END IF;

  IF action = 'add' THEN
    IF EXISTS (SELECT 1 FROM user_roles WHERE email = em) THEN
      UPDATE user_roles SET role = 'BAM_COMMITTEE' WHERE email = em;
    ELSE
      INSERT INTO user_roles (email, role, full_name) VALUES (em, 'BAM_COMMITTEE', em);
    END IF;
    RETURN jsonb_build_object('ok', true);

  ELSIF action = 'remove' THEN
    UPDATE user_roles SET role = 'STAFF' WHERE email = em AND role = 'BAM_COMMITTEE';
    RETURN jsonb_build_object('ok', true);

  ELSE
    RETURN jsonb_build_object('error', 'Invalid action — use add or remove');
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION assign_bam_committee(TEXT, TEXT) TO authenticated;
