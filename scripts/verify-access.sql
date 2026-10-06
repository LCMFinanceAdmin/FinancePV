-- Does the database actually refuse what it is supposed to refuse?
--
-- Not "does the predicate return false" -- that only proves the function
-- works. This runs real writes as the authenticated role, which is the only
-- role RLS is applied to, and reports what happened. Everything is inside a
-- transaction that is rolled back, so nothing it writes survives.
--
-- Two kinds of refusal, and they look nothing alike:
--
--   INSERT  violates WITH CHECK and raises insufficient_privilege.
--   UPDATE  fails USING by matching no rows. No error, nothing in the log,
--           and in a browser a save that simply did not happen.
--
-- The second is why this exists. A policy that is too tight is invisible
-- until somebody says "I pressed save and nothing happened".
--
-- People are resolved by role rather than named, so this survives somebody
-- leaving. A role nobody holds is reported as skipped, not failed.

BEGIN;

CREATE TEMP TABLE result(
  seq serial, area text, who text, attempt text,
  got text, expected text, verdict text
);
GRANT INSERT, SELECT ON result TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE result_seq_seq TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.whoever(p_role text) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT email FROM user_roles WHERE role = p_role ORDER BY email LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.a_portfolio_holder() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT email FROM user_roles
   WHERE COALESCE(array_length(ministries, 1), 0) > 0 ORDER BY email LIMIT 1;
$fn$;

CREATE OR REPLACE FUNCTION pg_temp.try_insert(
  p_area text, p_email text, p_who text, p_sql text, p_what text, p_expected boolean)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE allowed boolean;
BEGIN
  IF p_email IS NULL THEN
    INSERT INTO result(area, who, attempt, got, expected, verdict)
    VALUES (p_area, p_who, p_what, 'nobody holds this role', '-', 'SKIP');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('email', p_email)::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    EXECUTE p_sql;
    RESET ROLE;
    allowed := true;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    allowed := false;
  END;
  INSERT INTO result(area, who, attempt, got, expected, verdict)
  VALUES (p_area, p_who, p_what, allowed::text, p_expected::text,
          CASE WHEN allowed = p_expected THEN 'PASS' ELSE 'FAIL' END);
END $fn$;

-- How many rows SHOULD move is a count taken right now, as postgres, not a
-- number worked out earlier: the INSERT probes above add rows of their own,
-- and a stale count would report the policy as broken when it is not.
CREATE OR REPLACE FUNCTION pg_temp.try_update(
  p_area text, p_email text, p_who text, p_sql text, p_what text, p_reach_sql text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE n int; expected int;
BEGIN
  IF p_email IS NULL THEN
    INSERT INTO result(area, who, attempt, got, expected, verdict)
    VALUES (p_area, p_who, p_what, 'nobody holds this role', '-', 'SKIP');
    RETURN;
  END IF;
  EXECUTE p_reach_sql INTO expected;
  PERFORM set_config('request.jwt.claims', json_build_object('email', p_email)::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RESET ROLE;
  INSERT INTO result(area, who, attempt, got, expected, verdict)
  VALUES (p_area, p_who, p_what, n::text, expected::text,
          CASE WHEN n = expected THEN 'PASS' ELSE 'FAIL' END);
EXCEPTION WHEN insufficient_privilege THEN
  RESET ROLE;
  INSERT INTO result(area, who, attempt, got, expected, verdict)
  VALUES (p_area, p_who, p_what, 'refused outright', expected::text, 'FAIL');
END $fn$;

CREATE OR REPLACE FUNCTION pg_temp.try_count(
  p_area text, p_email text, p_who text, p_sql text, p_what text, p_expected text)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE n int; verdict text;
BEGIN
  IF p_email IS NULL THEN
    INSERT INTO result(area, who, attempt, got, expected, verdict)
    VALUES (p_area, p_who, p_what, 'nobody is in this position', '-', 'SKIP');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('email', p_email)::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO n;
  RESET ROLE;
  -- 'some' rather than a number: the count is how many leave types the church
  -- happens to offer, which is policy and moves. Nothing here depends on it
  -- being ten, only on it not being none.
  verdict := CASE
    WHEN p_expected = 'some' AND n > 0  THEN 'PASS'
    WHEN p_expected = 'none' AND n = 0  THEN 'PASS'
    ELSE 'FAIL' END;
  INSERT INTO result(area, who, attempt, got, expected, verdict)
  VALUES (p_area, p_who, p_what, n::text, p_expected, verdict);
END $fn$;

-- Calling something and seeing whether it refuses. seat_office_holder guards
-- itself with a plain RAISE rather than by failing a policy, so the refusal is
-- an ordinary exception and not insufficient_privilege.
CREATE OR REPLACE FUNCTION pg_temp.try_call(
  p_area text, p_email text, p_who text, p_sql text, p_what text, p_expected boolean)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE allowed boolean;
BEGIN
  IF p_email IS NULL THEN
    INSERT INTO result(area, who, attempt, got, expected, verdict)
    VALUES (p_area, p_who, p_what, 'nobody is in this position', '-', 'SKIP');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('email', p_email)::text, true);
  BEGIN
    SET LOCAL ROLE authenticated;
    EXECUTE p_sql;
    RESET ROLE;
    allowed := true;
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    allowed := false;
  END;
  INSERT INTO result(area, who, attempt, got, expected, verdict)
  VALUES (p_area, p_who, p_what, allowed::text, p_expected::text,
          CASE WHEN allowed = p_expected THEN 'PASS' ELSE 'FAIL' END);
END $fn$;

DO $probe$
DECLARE
  finance  text := pg_temp.whoever('FINANCE_ADMIN');
  accounts text := pg_temp.whoever('FINANCE_ADMIN_2');
  admin    text := pg_temp.whoever('ADMINISTRATOR');
  gm       text := pg_temp.whoever('GENERAL_MANAGER');
  bm       text := pg_temp.whoever('BUILDING_MANAGER');
  desk     text := pg_temp.whoever('MINISTRY_SUPPORT');
  exco     text := pg_temp.a_portfolio_holder();
  -- A signing officer: they sign vouchers, they do not keep the records.
  -- Resolved by the signing roles rather than by name, and the General Manager
  -- is deliberately not among them -- he signs and administers both.
  secretary text := (SELECT email FROM user_roles WHERE role = 'SECRETARY'
                      ORDER BY email LIMIT 1);
  treasury  uuid := (SELECT id FROM offices WHERE grants_role = 'TREASURER' LIMIT 1);
  -- The Secretary is deliberately not among them: 243 gave the office register
  -- back to that post, so a Secretary picked here would be expected to fail the
  -- "edit the offices" probe and would have passed it only by the accident of
  -- sorting second. The probes below cover the Secretary on their own terms.
  signer   text := (SELECT email FROM user_roles
                     WHERE role IN ('BISHOP', 'TREASURER')
                       AND COALESCE(is_test_account, false) = false
                     ORDER BY email LIMIT 1);
  -- Employed elsewhere, leave administered here. Resolved by that condition
  -- rather than by name, like everybody else in this file.
  guest_leave text := (SELECT email FROM user_roles
                        WHERE leave_under_lcm AND NOT is_lcm_staff
                        ORDER BY email LIMIT 1);
  volunteer   text := (SELECT email FROM user_roles
                        WHERE NOT is_lcm_staff AND NOT leave_under_lcm
                          AND is_pastor IS NOT TRUE AND role <> 'GUEST'
                          AND COALESCE(is_test_account, false) = false
                        ORDER BY email LIMIT 1);
BEGIN
  -- Money records belong to Finance.
  PERFORM pg_temp.try_insert('money', finance, 'Finance Executive',
    $q$INSERT INTO recurring_pvs(name,frequency,created_by) VALUES ('_probe','MONTHLY','_probe')$q$,
    'add a recurring voucher', true);
  PERFORM pg_temp.try_insert('money', exco, 'EXCO member',
    $q$INSERT INTO recurring_pvs(name,frequency,created_by) VALUES ('_probe','MONTHLY','_probe')$q$,
    'add a recurring voucher', false);
  PERFORM pg_temp.try_insert('money', desk, 'Ministry desk',
    $q$INSERT INTO recurring_pvs(name,frequency,created_by) VALUES ('_probe','MONTHLY','_probe')$q$,
    'add a recurring voucher', false);

  -- The registers belong to the Administrator and the Finance Executive.
  PERFORM pg_temp.try_insert('registers', admin, 'Administrator',
    $q$INSERT INTO departments(name) VALUES ('_probe')$q$, 'add a department', true);
  PERFORM pg_temp.try_insert('registers', accounts, 'Accounts Executive',
    $q$INSERT INTO departments(name) VALUES ('_probe2')$q$, 'add a department', false);
  PERFORM pg_temp.try_insert('registers', exco, 'EXCO member',
    $q$INSERT INTO departments(name) VALUES ('_probe3')$q$, 'add a department', false);

  -- A ministry writes its own budget papers.
  PERFORM pg_temp.try_insert('budget', exco, 'EXCO member',
    $q$INSERT INTO budget_proposals(ministry,year,created_by) VALUES ('_probe',2999,'_probe')$q$,
    'propose a budget', true);
  PERFORM pg_temp.try_insert('budget', desk, 'Ministry desk',
    $q$INSERT INTO budget_proposals(ministry,year,created_by) VALUES ('_probe',2999,'_probe')$q$,
    'propose a budget', false);

  -- The Building Manager raises worksheets and records facility income.
  PERFORM pg_temp.try_insert('worksheets', bm, 'Building Manager',
    $q$INSERT INTO worker_worksheets(worksheet_no,worker_type) VALUES ('_probe','CASUAL')$q$,
    'raise a worksheet', true);
  PERFORM pg_temp.try_insert('worksheets', exco, 'EXCO member',
    $q$INSERT INTO worker_worksheets(worksheet_no,worker_type) VALUES ('_probe2','CASUAL')$q$,
    'raise a worksheet', false);
  PERFORM pg_temp.try_insert('income', bm, 'Building Manager',
    $q$INSERT INTO income_records(record_no,payment_date) VALUES ('_probe','2999-01-01')$q$,
    'record income', true);
  PERFORM pg_temp.try_insert('income', gm, 'General Manager',
    $q$INSERT INTO income_records(record_no,payment_date) VALUES ('_probe2','2999-01-01')$q$,
    'record income', false);

  -- Banking belongs to Finance and to the General Manager.
  PERFORM pg_temp.try_insert('banking', gm, 'General Manager',
    $q$INSERT INTO bank_accounts(name,bank_name) VALUES ('_probe','_probe')$q$,
    'add a bank account', true);
  PERFORM pg_temp.try_insert('banking', admin, 'Administrator',
    $q$INSERT INTO bank_accounts(name,bank_name) VALUES ('_probe2','_probe')$q$,
    'add a bank account', false);

  -- And the silent half: an UPDATE refused by USING moves no rows at all.
  PERFORM pg_temp.try_update('banking', gm, 'General Manager',
    $q$UPDATE bank_accounts SET name = name$q$, 'edit bank accounts', $e$SELECT COUNT(*) FROM bank_accounts$e$);
  PERFORM pg_temp.try_update('banking', admin, 'Administrator',
    $q$UPDATE bank_accounts SET name = name$q$, 'edit bank accounts', $e$SELECT 0$e$);
  PERFORM pg_temp.try_update('registers', admin, 'Administrator',
    $q$UPDATE departments SET name = name$q$, 'edit departments', $e$SELECT COUNT(*) FROM departments$e$);
  PERFORM pg_temp.try_update('registers', accounts, 'Accounts Executive',
    $q$UPDATE departments SET name = name$q$, 'edit departments', $e$SELECT 0$e$);

  -- An EXCO Member reaches the ministries they hold and no others. That is
  -- what lets them appoint their checker without opening the whole register.
  PERFORM pg_temp.try_update('registers', admin, 'Administrator',
    $q$UPDATE ministries SET name = name$q$, 'edit ministries', $e$SELECT COUNT(*) FROM ministries$e$);
  PERFORM pg_temp.try_update('registers', exco, 'EXCO member',
    $q$UPDATE ministries SET name = name$q$, 'edit ministries',
     $e$SELECT COUNT(*) FROM ministries m
          JOIN user_roles u ON u.email = pg_temp.a_portfolio_holder()
         WHERE lower(m.name) = ANY (SELECT lower(x) FROM unnest(u.ministries) x)$e$);
  PERFORM pg_temp.try_update('registers', desk, 'Ministry desk',
    $q$UPDATE ministries SET name = name$q$, 'edit ministries', $e$SELECT 0$e$);

  -- Nobody but the service role may touch the PIN hashes and signatures.
  PERFORM pg_temp.try_insert('credentials', finance, 'Finance Executive',
    $q$INSERT INTO user_security_credentials(email) VALUES ('_probe@example.com')$q$,
    'write a PIN hash', false);
  PERFORM pg_temp.try_insert('credentials', admin, 'Administrator',
    $q$INSERT INTO user_security_credentials(email) VALUES ('_probe2@example.com')$q$,
    'write a PIN hash', false);
  -- Leave is gated by a function rather than a policy, and it fails the same
  -- quiet way: somebody not entitled is offered no leave type at all, which on
  -- the page is an empty form rather than a refusal. Two people are employed by
  -- the Trustees and not by LCM, and the General Manager approves their leave
  -- all the same (241) -- so "LCM does not employ you" must not be the question
  -- the leave form asks.
  PERFORM pg_temp.try_count('leave', guest_leave, 'Trustees employee',
    $q$SELECT count(*) FROM my_leave_entitlements()$q$,
    'is offered leave', 'some');
  PERFORM pg_temp.try_count('leave', volunteer, 'Volunteer officer',
    $q$SELECT count(*) FROM my_leave_entitlements()$q$,
    'is offered leave', 'none');
  -- And the leave must not have dragged the rest of employment along with it.
  PERFORM pg_temp.try_count('leave', guest_leave, 'Trustees employee',
    $q$SELECT count(*) FROM my_claim_entitlements()$q$,
    'is offered staff claims', 'none');
  -- A signing officer reads the church's records and writes none of them (242).
  --
  -- They used to write all of them. The role column is the one that matters:
  -- it decides who may approve what, so an officer who could edit it could
  -- promote anybody, themselves included, to Finance Executive. Reading is
  -- deliberately still open -- knowing who somebody is is part of deciding
  -- whether to sign a payment to them.
  PERFORM pg_temp.try_count('records', signer, 'Signing officer',
    $q$SELECT count(*) FROM people$q$, 'may read the directory', 'some');
  PERFORM pg_temp.try_update('records', signer, 'Signing officer',
    $q$UPDATE people SET full_name = full_name$q$,
    'edit the directory', $e$SELECT 0$e$);
  PERFORM pg_temp.try_update('records', signer, 'Signing officer',
    $q$UPDATE user_roles SET role = role$q$,
    'change what anybody may approve', $e$SELECT 0$e$);
  PERFORM pg_temp.try_update('records', signer, 'Signing officer',
    $q$UPDATE offices SET name = name$q$,
    'edit the offices', $e$SELECT 0$e$);

  -- And the people who do keep them, still do.
  PERFORM pg_temp.try_update('records', admin, 'Administrator',
    $q$UPDATE people SET full_name = full_name$q$,
    'edit the directory', $e$SELECT COUNT(*) FROM people$e$);
  PERFORM pg_temp.try_update('records', gm, 'General Manager',
    $q$UPDATE user_roles SET role = role$q$,
    'change what anybody may approve', $e$SELECT COUNT(*) FROM user_roles$e$);
  -- The Secretary keeps the office register, and only that (243). Recording an
  -- election has to move the role with the post, so the role is read off the
  -- office rather than named by the caller: they can seat somebody, they
  -- cannot invent a rank, and the directory is still none of their business.
  PERFORM pg_temp.try_update('records', secretary, 'Secretary',
    $q$UPDATE offices SET name = name$q$,
    'edit the office register', $e$SELECT COUNT(*) FROM offices$e$);
  PERFORM pg_temp.try_update('records', secretary, 'Secretary',
    $q$UPDATE people SET full_name = full_name$q$,
    'edit the directory', $e$SELECT 0$e$);
  PERFORM pg_temp.try_update('records', secretary, 'Secretary',
    $q$UPDATE user_roles SET role = role$q$,
    'set a role by hand', $e$SELECT 0$e$);
  PERFORM pg_temp.try_call('records', secretary, 'Secretary',
    format($q$SELECT seat_office_holder(%L, %L, NULL)$q$, treasury, secretary),
    'seat a holder, taking the role from the office', true);
  -- And somebody who does not keep the register cannot use it as a way in.
  PERFORM pg_temp.try_call('records', desk, 'Ministry desk',
    format($q$SELECT seat_office_holder(%L, %L, NULL)$q$, treasury, desk),
    'seat a holder, taking the role from the office', false);
END $probe$;

INSERT INTO result(seq, area, who, attempt, got, expected, verdict)
SELECT 0, '-- TALLY --', '', '',
       COUNT(*) FILTER (WHERE verdict = 'PASS') || ' passed',
       COUNT(*) FILTER (WHERE verdict = 'FAIL') || ' failed',
       CASE WHEN COUNT(*) FILTER (WHERE verdict = 'FAIL') = 0
            THEN 'ALL OK' ELSE 'LOOK AT THE FAILURES BELOW' END
  FROM result;

SELECT area, who, attempt, got, expected, verdict FROM result ORDER BY seq;

ROLLBACK;
