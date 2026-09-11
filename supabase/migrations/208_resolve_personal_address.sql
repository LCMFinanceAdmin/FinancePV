-- 208: the address somebody actually signed in with.
--
-- Eddie Kwan has two logins. eddie.kwan@lcm.org.my carries BUILDING_MANAGER;
-- kpkwan63@gmail.com, which he used on 3 July, carries nothing and resolved to
-- nothing, so that session had no role at all — no BAM queue, no worksheets, no
-- facility bookings, and no indication why.
--
-- 207 mapped user_email and work_email to an account but not the directory's
-- own email column, which is where a personal address lives. Checked before
-- widening: no two people share an email, and no person''s email is another
-- person''s user_email or work_email, so the column is as safe to resolve from
-- as the other two. The one-match guard stays regardless — an address on two
-- records still returns nothing rather than handing one person another''s role.

CREATE OR REPLACE FUNCTION resolve_role_email(p_login TEXT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_exact  TEXT;
  v_person UUID;
  v_email  TEXT;
  v_count  INT;
BEGIN
  IF COALESCE(p_login, '') = '' THEN RETURN NULL; END IF;

  -- An address that is itself an account always wins, so this can never
  -- redirect somebody away from their own row.
  SELECT u.email INTO v_exact FROM user_roles u WHERE lower(u.email) = lower(p_login) LIMIT 1;
  IF v_exact IS NOT NULL THEN RETURN v_exact; END IF;

  -- Exactly one person, or nothing.
  SELECT count(*) INTO v_count
    FROM people p
   WHERE lower(COALESCE(p.user_email, '')) = lower(p_login)
      OR lower(COALESCE(p.work_email, '')) = lower(p_login)
      OR lower(COALESCE(p.email, ''))      = lower(p_login);
  IF v_count <> 1 THEN RETURN NULL; END IF;

  SELECT p.id INTO v_person
    FROM people p
   WHERE lower(COALESCE(p.user_email, '')) = lower(p_login)
      OR lower(COALESCE(p.work_email, '')) = lower(p_login)
      OR lower(COALESCE(p.email, ''))      = lower(p_login)
   LIMIT 1;

  -- And exactly one account among that person's addresses, for the same reason.
  SELECT count(*), min(u.email) INTO v_count, v_email
    FROM user_roles u
   WHERE lower(u.email) = ANY (
     SELECT unnest(array_remove(ARRAY[lower(p.user_email), lower(p.work_email), lower(p.email)], NULL))
       FROM people p WHERE p.id = v_person);
  IF v_count <> 1 THEN RETURN NULL; END IF;

  RETURN v_email;
END;
$$;

SELECT a.email AS login, COALESCE(resolve_role_email(a.email),'(none)') AS resolves_to,
       COALESCE((SELECT u.role::text FROM user_roles u WHERE u.email=resolve_role_email(a.email)),'—') AS role
  FROM auth.users a ORDER BY a.email;
