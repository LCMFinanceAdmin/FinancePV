-- 118: Changing somebody's sign-in address without losing their history.
--
-- There was no way to change an existing address at all — only grant one or
-- revoke it — and the reason becomes obvious the moment you look at what the
-- address is doing. It is not a field on an account; it IS the identity, joined
-- by text from about fifty columns with almost no foreign keys behind it.
-- Counted on live data, the finance account alone is referenced 163 times
-- across 24 tables: 26 vouchers, 53 recurring vouchers, their drawn signature,
-- their approval PIN, their push subscriptions.
--
-- So `UPDATE user_roles SET email = …` is not a rename. It is a rename of the
-- account and an orphaning of everything the person ever did, and it would
-- report success. (Two foreign keys would actually have blocked it —
-- user_security_credentials and role_switch_grants — so the failure would at
-- least have been loud. Everything else would have gone quiet.)
--
-- This does it properly: every column that holds the person's login moves in
-- one transaction, or none of it does.
--
-- What deliberately does NOT move: people.email, organisations.email and
-- payroll_employees.email. Those are contact addresses that happen sometimes to
-- equal the login. Somebody's personal email did not change because their
-- sign-in did, and quietly rewriting it would be a different bug of the same
-- family as the one this fixes.

-- ── Let the two real foreign keys follow ──────────────────────────────────
ALTER TABLE user_security_credentials
  DROP CONSTRAINT IF EXISTS user_security_credentials_email_fkey;
ALTER TABLE user_security_credentials
  ADD CONSTRAINT user_security_credentials_email_fkey
  FOREIGN KEY (email) REFERENCES user_roles(email) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE role_switch_grants
  DROP CONSTRAINT IF EXISTS role_switch_grants_user_email_fkey;
ALTER TABLE role_switch_grants
  ADD CONSTRAINT role_switch_grants_user_email_fkey
  FOREIGN KEY (user_email) REFERENCES user_roles(email) ON UPDATE CASCADE ON DELETE CASCADE;

-- ── The rename ────────────────────────────────────────────────────────────
-- Dry run by default. A caller asks what would move, shows the person that
-- number, and only then applies — which is the difference between a button
-- somebody is willing to press and one they are not.
--
-- The column list is discovered from the catalogue rather than written out,
-- because a hand-typed list of fifty columns is wrong the first time somebody
-- adds a table and nobody notices until an address is changed a year later.
CREATE OR REPLACE FUNCTION rename_user_login(
  p_old   TEXT,
  p_new   TEXT,
  p_apply BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r        RECORD;
  v_old    TEXT := lower(trim(p_old));
  v_new    TEXT := lower(trim(p_new));
  v_n      BIGINT;
  v_total  BIGINT := 0;
  v_detail JSONB  := '{}'::JSONB;
BEGIN
  IF NOT can_manage_people() THEN
    RAISE EXCEPTION 'Only the people directory may change a sign-in address';
  END IF;
  IF v_new !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' THEN
    RAISE EXCEPTION 'That is not a valid email address';
  END IF;
  IF v_old = v_new THEN
    RAISE EXCEPTION 'The new address is the same as the current one';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE lower(email) = v_old) THEN
    RAISE EXCEPTION 'No account signs in as %', p_old;
  END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE lower(email) = v_new) THEN
    RAISE EXCEPTION 'Somebody already signs in as %', p_new;
  END IF;

  -- user_roles first: the two foreign keys above cascade from it, and a child
  -- row cannot point at an address its parent does not have yet.
  IF p_apply THEN
    UPDATE user_roles SET email = v_new WHERE lower(email) = v_old;
  END IF;
  v_detail := jsonb_set(v_detail, '{user_roles.email}', to_jsonb(1));
  v_total  := v_total + 1;

  FOR r IN
    SELECT table_name AS t, column_name AS c
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND data_type = 'text'
       AND (column_name LIKE '%email%' OR column_name IN ('created_by','updated_by','paid_by'))
       -- Handled above, and its children by cascade.
       AND table_name <> 'user_roles'
       -- Contact addresses, not logins. See the note at the top.
       AND (table_name, column_name) NOT IN (
         ('people','email'), ('organisations','email'), ('payroll_employees','email')
       )
     ORDER BY table_name, column_name
  LOOP
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE lower(%I) = $1', r.t, r.c
    ) INTO v_n USING v_old;

    IF v_n > 0 THEN
      IF p_apply THEN
        EXECUTE format(
          'UPDATE public.%I SET %I = $1 WHERE lower(%I) = $2', r.t, r.c, r.c
        ) USING v_new, v_old;
      END IF;
      v_detail := jsonb_set(v_detail, ARRAY[r.t || '.' || r.c], to_jsonb(v_n));
      v_total  := v_total + v_n;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'applied', p_apply,
    'from',    v_old,
    'to',      v_new,
    'rows',    v_total,
    'columns', (SELECT count(*) FROM jsonb_object_keys(v_detail)),
    'detail',  v_detail
  );
END;
$$;

REVOKE ALL ON FUNCTION rename_user_login(TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION rename_user_login(TEXT, TEXT, BOOLEAN) TO authenticated;

COMMENT ON FUNCTION rename_user_login(TEXT, TEXT, BOOLEAN) IS
  'Moves a person''s sign-in address across every column that holds it, in one transaction. Dry run unless p_apply is true. Does not touch contact addresses.';
