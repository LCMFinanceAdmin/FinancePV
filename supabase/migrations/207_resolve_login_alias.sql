-- 207: one person, more than one address they might sign in with.
--
-- We do not actually know which address Eric Mau uses. mission@lcm.org.my is
-- the Mission office account and may never have been a mailbox he opened;
-- eric.mau@lcm.org.my is his own. Neither has a login yet, so the question
-- cannot be settled by looking — and guessing wrong means he signs in
-- successfully and the system tells him he has no role at all.
--
-- 202 made this worse by overwriting the office address off his person record
-- while moving his account to his own. That is reverted: both addresses are
-- recorded again, the office one as user_email and his own as work_email,
-- which is what they are.
--
-- The account itself stays single. Two user_roles rows for one person is the
-- mess this repository has spent the day undoing: approvals recorded under two
-- names, notifications split between two inboxes, and .single() lookups that
-- fail in ways that read as a permissions bug. So instead the sign-in address
-- is resolved to the one account, and everything downstream — approvals,
-- notifications, the audit trail — uses that one address whichever way he came
-- in.
--
-- This is not only Eric Mau. Chan Mun Kwan carries three addresses; anyone
-- issued an office account alongside their own will carry two.

UPDATE people
   SET user_email = 'mission@lcm.org.my',
       work_email = 'eric.mau@lcm.org.my'
 WHERE full_name = 'Eric Mau';

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

  -- An address that is itself an account always wins. Aliasing is only ever a
  -- fallback, so this can never redirect somebody away from their own row.
  SELECT u.email INTO v_exact FROM user_roles u WHERE lower(u.email) = lower(p_login) LIMIT 1;
  IF v_exact IS NOT NULL THEN RETURN v_exact; END IF;

  -- Otherwise the directory says whose address this is. Exactly one person, or
  -- nothing: an address on two records is a data fault, and resolving it would
  -- hand one person another's role.
  SELECT count(*) INTO v_count
    FROM people p
   WHERE lower(COALESCE(p.user_email, '')) = lower(p_login)
      OR lower(COALESCE(p.work_email, '')) = lower(p_login);
  IF v_count <> 1 THEN RETURN NULL; END IF;

  SELECT p.id INTO v_person
    FROM people p
   WHERE lower(COALESCE(p.user_email, '')) = lower(p_login)
      OR lower(COALESCE(p.work_email, '')) = lower(p_login)
   LIMIT 1;

  -- And exactly one account among that person's other addresses, for the same
  -- reason.
  SELECT count(*), min(u.email) INTO v_count, v_email
    FROM user_roles u
   WHERE lower(u.email) = ANY (
     SELECT unnest(array_remove(ARRAY[lower(p.user_email), lower(p.work_email), lower(p.email)], NULL))
       FROM people p WHERE p.id = v_person);
  IF v_count <> 1 THEN RETURN NULL; END IF;

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION resolve_role_email(TEXT) TO authenticated, anon, service_role;

COMMENT ON FUNCTION resolve_role_email(TEXT) IS
  'The user_roles address for somebody signing in with this one. An address that is itself an account returns unchanged; otherwise the directory maps it to that person''s single account. Ambiguity returns NULL rather than a guess.';

SELECT resolve_role_email('mission@lcm.org.my')      AS office_account_resolves_to,
       resolve_role_email('eric.mau@lcm.org.my')     AS own_address_resolves_to,
       resolve_role_email('rev.chanmk@gmail.com')    AS chan_personal,
       resolve_role_email('munkwan.chan@lcm.org.my') AS chan_work,
       resolve_role_email('educationdesk@lcm.org.my') AS chan_account,
       resolve_role_email('finance@lcm.org.my')      AS gm_unchanged,
       resolve_role_email('nobody@example.com')      AS unknown_returns_null;
