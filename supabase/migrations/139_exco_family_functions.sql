-- 139: the two functions that named MINISTRY_HEAD now speak for the family.
--
-- 138 added a role per EXCO portfolio and is_exco_role() to recognise them.
-- These are the only two functions in the database that tested the old key
-- directly — no RLS policy did, because the policy layer already works through
-- can_*() predicates. Both would otherwise treat a portfolio holder as though
-- they held no EXCO seat at all.

-- ── switch_own_role ───────────────────────────────────────────────────────
-- The role switcher. It checked `new_role = 'MINISTRY_HEAD'` twice: once to
-- validate the ministry selection against the grant, once to decide whether to
-- keep the ministries or clear them. Switching to EXCO_EDUCATION would have
-- silently wiped the portfolio on the way in.
CREATE OR REPLACE FUNCTION switch_own_role(new_role text, new_ministries text[] DEFAULT '{}'::text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_email TEXT;
  permitted_ministries TEXT[];
BEGIN
  caller_email := auth.jwt() ->> 'email';
  IF caller_email IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT grants.ministries INTO permitted_ministries
  FROM public.role_switch_grants grants
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

  UPDATE public.user_roles
  SET role = new_role,
      ministries = CASE WHEN is_exco_role(new_role) THEN new_ministries ELSE '{}'::text[] END,
      updated_at = NOW()
  WHERE email = caller_email;
END;
$function$;

-- ── assign_ministry_head ──────────────────────────────────────────────────
-- Nothing in the app calls this any more; the People directory and Access &
-- Roles both write user_roles directly. It is corrected rather than dropped
-- because a dead function that assigns the WRONG role is worse than one that
-- assigns the right one — if anything ever reaches it, it should not quietly
-- demote a portfolio holder to the generic seat.
CREATE OR REPLACE FUNCTION assign_ministry_head(target_email text, ministry_name text, action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller_role TEXT;
  existing_ministries TEXT[];
  existing_role TEXT;
  new_ministries TEXT[];
  portfolio_role TEXT;
BEGIN
  SELECT role INTO caller_role FROM user_roles WHERE email = (auth.jwt() ->> 'email');
  IF caller_role NOT IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2') THEN
    RETURN jsonb_build_object('error', 'Finance Admin only');
  END IF;

  -- The portfolio's own role where one exists — a ministry that is not an EXCO
  -- portfolio has none, and falls back to the generic seat.
  SELECT key INTO portfolio_role FROM app_roles WHERE key = exco_role_key(ministry_name);

  IF action = 'add' THEN
    SELECT ministries, role INTO existing_ministries, existing_role
      FROM user_roles WHERE email = target_email;
    IF NOT FOUND THEN
      INSERT INTO user_roles (email, role, ministries, full_name)
      VALUES (target_email, COALESCE(portfolio_role, 'MINISTRY_HEAD'), ARRAY[ministry_name], target_email);
    ELSE
      IF existing_ministries IS NOT NULL AND ministry_name = ANY(existing_ministries) THEN
        RETURN jsonb_build_object('error', 'Already assigned to this ministry');
      END IF;
      new_ministries := COALESCE(existing_ministries, ARRAY[]::TEXT[]) || ministry_name;
      UPDATE user_roles
        SET role = CASE
              -- Somebody already holding a portfolio keeps it: adding a second
              -- ministry must not rewrite which seat they were elected to.
              WHEN is_exco_role(existing_role) THEN existing_role
              ELSE COALESCE(portfolio_role, 'MINISTRY_HEAD')
            END,
            ministries = new_ministries
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
$function$;
