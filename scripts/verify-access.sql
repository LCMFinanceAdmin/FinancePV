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
-- leaving. A role nobody holds is reported as skipped, not failed -- and the
-- tally says how many skipped, because a check that did not run has not
-- passed, however much the bottom line would like to say so.

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

-- Some desks exist in numbered variants that the app treats as one for
-- rights: FINANCE_ADMIN_2 is the Accounts Executive, and she sits inside
-- isFinanceAdmin alongside the Finance Executive. Resolving only the exact
-- role meant that when nobody held FINANCE_ADMIN the Finance probes skipped,
-- and a skipped probe reads like a passing one. The roles are tried in the
-- order given, so the proper holder is still preferred where there is one.
CREATE OR REPLACE FUNCTION pg_temp.whoever_any(p_roles text[]) RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT u.email
    FROM unnest(p_roles) WITH ORDINALITY AS r(role, ord)
    JOIN user_roles u ON u.role = r.role
   ORDER BY r.ord, u.email
   LIMIT 1;
$fn$;

-- An EXCO member, for the probes that ask what somebody with a portfolio and
-- no further standing may do.
--
-- The Secretary is excluded, and not because of anything she may or may not
-- do. The records probes below seat her in the Treasurer's office, which is
-- the point of that probe -- the role comes with the office -- and
-- seat_office_holder also empties the incoming holder's ministries. So from
-- that line on she is a Treasurer with no portfolio, and every later probe
-- addressing her as an EXCO member would be asking the wrong person: the
-- budget ones would report a rule broken, and the one that reads
-- ministries[1] would hand a NULL ministry to an INSERT and take the whole
-- run down with it.
--
-- The Secretary holds no portfolio today, so this clause selects nothing out
-- and costs nothing. It is here for the day she is given one, so that a
-- reshuffle in the church does not arrive looking like a bug in the database.
CREATE OR REPLACE FUNCTION pg_temp.a_portfolio_holder() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT email FROM user_roles
   WHERE COALESCE(array_length(ministries, 1), 0) > 0
     AND role::text <> 'SECRETARY'
   ORDER BY email LIMIT 1;
$fn$;

-- Somebody with a portfolio who is nonetheless outside the budget-change
-- gate.
--
-- a_portfolio_holder() takes the first person holding any ministry, which
-- today is an EXCO member and tomorrow might be the General Manager -- he
-- holds portfolios, and he may decide a budget change. A probe that expects a
-- refusal has to name somebody who will actually be refused, or the day that
-- sort order changes it reports the rule broken when what moved was the
-- person. The list is can_decide_budget_change()'s, spelled out because a
-- probe cannot ask the function whether it would have said yes.
CREATE OR REPLACE FUNCTION pg_temp.outside_the_change_gate() RETURNS text
LANGUAGE sql STABLE AS $fn$
  SELECT email FROM user_roles
   WHERE COALESCE(array_length(ministries, 1), 0) > 0
     AND COALESCE(is_test_account, false) = false
     AND role::text NOT IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3',
                            'TREASURER', 'BISHOP', 'SECRETARY', 'GENERAL_MANAGER')
   ORDER BY email LIMIT 1;
$fn$;

-- Somebody 273 is actually for, and the claim that puts them there.
--
-- The situation is built rather than hunted for. Every claimant in the book
-- today also sits on the committee their expense was booked to, or is Finance,
-- so a probe that looked for a real one would skip -- and a skipped probe on a
-- policy that was just written is the worst of both: it reports nothing and
-- reads like nothing is wrong. Worse, pick a claimant who would have seen the
-- voucher anyway and the check goes green whether or not the policy exists.
--
-- So: find a person who could NOT see some voucher on either older ground --
-- not booked to a ministry of theirs, not submitted by them, not Finance or a
-- senior officer who sees every voucher -- and name them claimant on it. The
-- row is written inside this transaction and rolled back with everything else.
--
-- Returns the email, with pg_temp.probe_pv() holding the voucher; NULL if no
-- such pairing exists at all, which would itself be worth knowing.
CREATE OR REPLACE FUNCTION pg_temp.stage_a_claimant() RETURNS text
LANGUAGE plpgsql AS $fn$
DECLARE e text; v uuid;
BEGIN
  FOR e IN
    SELECT lower(u.email) FROM user_roles u
     WHERE COALESCE(u.is_test_account, false) = false
       AND u.role <> 'GUEST'
     ORDER BY u.email
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('email', e)::text, true);
    IF is_finance_admin_or_senior() THEN CONTINUE; END IF;
    SELECT p.id INTO v FROM pvs p
     WHERE NOT can_see_ministry_pv(p.ministry)
       AND lower(COALESCE(p.submitted_by_email, '')) <> e
       AND p.id NOT IN (SELECT pv_id FROM gm_claims WHERE pv_id IS NOT NULL)
       AND p.id NOT IN (SELECT pv_id FROM purchase_requests WHERE pv_id IS NOT NULL)
     ORDER BY p.pv_no LIMIT 1;
    IF v IS NOT NULL THEN
      PERFORM set_config('request.jwt.claims', NULL, true);
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION pg_temp.probe_pv() RETURNS uuid LANGUAGE sql IMMUTABLE AS $p$ SELECT %L::uuid $p$', v);
      INSERT INTO gm_claims(claim_no, claimant_name, claimant_email, amount, purpose,
                            created_by_email, pv_id, gm_status)
      VALUES ('_PROBE-273', '_probe', e, 1, '_probe', '_probe', v, 'ACCEPTED');
      RETURN e;
    END IF;
  END LOOP;
  PERFORM set_config('request.jwt.claims', NULL, true);
  RETURN NULL;
END $fn$;

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
  finance  text := pg_temp.whoever_any(
    ARRAY['FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3']);
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
  treasurer text := (SELECT email FROM user_roles WHERE role = 'TREASURER'
                      AND COALESCE(is_test_account, false) = false
                      ORDER BY email LIMIT 1);
  a_budget  uuid;
  a_change  uuid;
  outsider  text := pg_temp.outside_the_change_gate();
  -- The Bishop stands either side of the two budget gates: he may decide a
  -- change to a budget in force and may not approve the budget itself. The
  -- Secretary is in the same position and would have read better here, but
  -- the records probes above seat her in the Treasurer's office, so by the
  -- time the budget probes run she is a Treasurer. Nothing in this script
  -- changes what the Bishop is.
  bishop    text := (SELECT email FROM user_roles WHERE role = 'BISHOP'
                      AND COALESCE(is_test_account, false) = false
                      ORDER BY email LIMIT 1);
  -- The EXCO register a budget decision now cites (265), staged below.
  held_meeting      uuid;
  future_meeting    uuid;
  a_resolution      uuid;
  future_resolution uuid;
  -- A real employee, read as postgres so every probe below inserts an actual
  -- row rather than nothing at all.
  an_employee uuid := (SELECT id FROM payroll_employees ORDER BY emp_no LIMIT 1);
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
  claimant    text := pg_temp.stage_a_claimant();
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
  -- For a ministry they actually hold. Since 247 the ministry is part of the
  -- question: proposing a budget for somebody else's is refused, which is the
  -- probe below rather than this one.
  PERFORM pg_temp.try_insert('budget', exco, 'EXCO member',
    format($q$INSERT INTO budget_proposals(ministry,year,created_by)
              VALUES (%L,2999,'_probe')$q$,
           (SELECT ministries[1] FROM user_roles WHERE email = pg_temp.a_portfolio_holder())),
    'propose a budget for their own ministry', true);
  PERFORM pg_temp.try_insert('budget', exco, 'EXCO member',
    $q$INSERT INTO budget_proposals(ministry,year,created_by) VALUES ('_probe',2994,'_probe')$q$,
    'propose a budget for a ministry they do not hold', false);
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
  -- The NULL third argument is load-bearing. It is the outgoing holder, and
  -- naming one demotes them to STAFF -- so passing the sitting Treasurer here,
  -- which is the obvious way to make this probe test a proper handover, would
  -- strip the role from the person every budget probe below addresses as the
  -- Treasurer. The "allowed" ones would fail, which is survivable; the
  -- "refused" ones would pass while asking a STAFF member, which is not.
  -- Probe the handover somewhere it cannot reach the rest of the run.
  PERFORM pg_temp.try_call('records', secretary, 'Secretary',
    format($q$SELECT seat_office_holder(%L, %L, NULL)$q$, treasury, secretary),
    'seat a holder, taking the role from the office', true);
  -- That probe just seated this person in the Treasurer's office, and the
  -- whole point of it is that the role comes with the office -- so from here
  -- on, inside this transaction, they ARE the Treasurer. The handle is spent.
  --
  -- Dropped rather than documented, because a later probe reusing it would
  -- not fail: it would pass, having silently asked a Treasurer whatever it
  -- meant to ask a Secretary. That has already happened once. A NULL makes
  -- the next use report "nobody is in this position" and the tally say some
  -- checks did not run, which is a question rather than a lie.
  secretary := NULL;
  -- The leave compliance list names people and their service dates, so it is
  -- not for everybody who can sign in (250).
  PERFORM pg_temp.try_call('leave', gm, 'General Manager',
    $q$SELECT count(*) FROM leave_service_gaps()$q$,
    'read the leave service gaps', true);
  PERFORM pg_temp.try_call('leave', desk, 'Ministry desk',
    $q$SELECT count(*) FROM leave_service_gaps()$q$,
    'read the leave service gaps', false);

  -- And somebody who does not keep the register cannot use it as a way in.
  PERFORM pg_temp.try_call('records', desk, 'Ministry desk',
    format($q$SELECT seat_office_holder(%L, %L, NULL)$q$, treasury, desk),
    'seat a holder, taking the role from the office', false);
  -- A budget is approved by the EXCO voting at a meeting held for it, and the
  -- app records that rather than deciding it (244). approve_budget_proposal
  -- holds definer rights, so it asks these for itself: hiding the button is
  -- not the same as refusing the action.
  --
  -- 265 changed how the meeting is named. It used to be typed in — a
  -- reference and a date, in two boxes — and is now a resolution chosen from
  -- the EXCO register, so the decision functions take p_resolution uuid and
  -- read the reference and date off the register themselves. The typed-text
  -- forms were kept, raising "reload the page", so an open tab gets a sentence
  -- instead of "function does not exist".
  --
  -- These probes were not changed with it, and went on calling the typed-text
  -- form. Two of them failed, which is how it was noticed; the other four were
  -- worse — they expected a refusal, got one, and passed, when what refused
  -- them was the deprecation notice rather than the rule they were written to
  -- check. Four green lines proving nothing is a worse state than two red
  -- ones, so the whole block is rewritten against the contract that exists.
  --
  -- Two resolutions to cite: one from a meeting that has been held, one from a
  -- meeting still to come. "A decision is recorded after the EXCO has met" is
  -- then probed rather than asserted.
  INSERT INTO exco_meetings(ref, meeting_date, recorded_by)
  VALUES ('_probe/held', CURRENT_DATE - 7, '_probe') RETURNING id INTO held_meeting;
  INSERT INTO exco_resolutions(meeting_id, ref, subject, recorded_by)
  VALUES (held_meeting, 'EXCO/_probe/1', '_probe', '_probe') RETURNING id INTO a_resolution;

  INSERT INTO exco_meetings(ref, meeting_date, recorded_by)
  VALUES ('_probe/ahead', CURRENT_DATE + 30, '_probe') RETURNING id INTO future_meeting;
  INSERT INTO exco_resolutions(meeting_id, ref, subject, recorded_by)
  VALUES (future_meeting, 'EXCO/_probe/2', '_probe', '_probe') RETURNING id INTO future_resolution;

  -- A different year from the proposal the 'budget' probes above raise:
  -- (ministry, year) is unique, and the two would collide.
  INSERT INTO budget_proposals(ministry, year, status, created_by)
  VALUES ('_probe', 2998, 'SUBMITTED', '_probe') RETURNING id INTO a_budget;

  PERFORM pg_temp.try_call('budget', desk, 'Ministry desk',
    format($q$SELECT approve_budget_proposal(%L, %L, %L::uuid, NULL)$q$,
           a_budget, desk, a_resolution),
    'approve a budget', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT approve_budget_proposal(%L, %L, NULL::uuid, NULL)$q$,
           a_budget, treasurer),
    'approve citing no resolution', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT approve_budget_proposal(%L, %L, gen_random_uuid(), NULL)$q$,
           a_budget, treasurer),
    'approve citing a resolution not in the register', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT approve_budget_proposal(%L, %L, %L::uuid, NULL)$q$,
           a_budget, treasurer, future_resolution),
    'approve citing a meeting still to come', false);
  -- The kept typed-text form must decide nothing, or it is a way round the
  -- register for anyone who can reach the database directly.
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT approve_budget_proposal(%L, %L, 'EXCO/9999/1', CURRENT_DATE, NULL)$q$,
           a_budget, treasurer),
    'approve by typing a reference instead', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT approve_budget_proposal(%L, %L, %L::uuid, NULL)$q$,
           a_budget, treasurer, a_resolution),
    'approve citing a resolution', true);

  -- Sending one back is the same meeting's decision, and went straight from
  -- the browser as an UPDATE until 245 — so an EXCO member could reject any
  -- ministry's budget, and the mandatory reason was enforced by the form alone.
  INSERT INTO budget_proposals(ministry, year, status, created_by)
  VALUES ('_probe', 2997, 'SUBMITTED', '_probe') RETURNING id INTO a_budget;

  PERFORM pg_temp.try_call('budget', exco, 'EXCO member',
    format($q$SELECT reject_budget_proposal(%L, %L, %L::uuid, 'no')$q$,
           a_budget, exco, a_resolution),
    'send a budget back', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT reject_budget_proposal(%L, %L, %L::uuid, '  ')$q$,
           a_budget, treasurer, a_resolution),
    'send back with no reason', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT reject_budget_proposal(%L, %L, NULL::uuid, 'Too high')$q$,
           a_budget, treasurer),
    'send back citing no resolution', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT reject_budget_proposal(%L, %L, 'EXCO/9999/2', CURRENT_DATE, 'Too high')$q$,
           a_budget, treasurer),
    'send back by typing a reference instead', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT reject_budget_proposal(%L, %L, %L::uuid, 'Trim the camp line')$q$,
           a_budget, treasurer, a_resolution),
    'send back citing a resolution', true);

  -- ── Changing a budget already in force ────────────────────────────────
  --
  -- The other two decisions 265 reworked, and nothing probed either of them.
  -- They matter more than the pair above rather than less: a mid-year change
  -- needs no threshold and no countersign, so one officer decides it alone,
  -- and which officers those are is the whole of the control.
  --
  -- can_decide_budget_change() is deliberately wider than the proposal gate --
  -- it adds the Bishop, the Secretary and the General Manager. That widening
  -- was written in one function and checked nowhere, so the two probes below
  -- stand either side of it: the Bishop may decide a change to a budget in
  -- force, and may not approve the budget itself.
  INSERT INTO budget_proposals(ministry, year, status, created_by)
  VALUES ('_probe', 2996, 'SUBMITTED', '_probe') RETURNING id INTO a_budget;

  PERFORM pg_temp.try_call('budget', bishop, 'Bishop',
    format($q$SELECT approve_budget_proposal(%L, %L, %L::uuid, NULL)$q$,
           a_budget, bishop, a_resolution),
    'approve a budget proposal', false);

  INSERT INTO budget_change_requests(ministry, change_type, proposed_data, requested_by)
  VALUES ('_probe', 'add', '{"project_name":"_probe line","estimated_expenses":1}'::jsonb, '_probe')
  RETURNING id INTO a_change;

  PERFORM pg_temp.try_call('budget', desk, 'Ministry desk',
    format($q$SELECT apply_budget_change_request(%L, 2998, %L::uuid)$q$,
           a_change, a_resolution),
    'change a budget in force', false);
  PERFORM pg_temp.try_call('budget', outsider, 'EXCO member',
    format($q$SELECT apply_budget_change_request(%L, 2998, %L::uuid)$q$,
           a_change, a_resolution),
    'change a budget in force', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT apply_budget_change_request(%L, 2998, NULL::uuid)$q$, a_change),
    'change it citing no resolution', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT apply_budget_change_request(%L, 2998, %L::uuid)$q$,
           a_change, future_resolution),
    'change it citing a meeting still to come', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT apply_budget_change_request(%L, 2998, 'EXCO/9999/3', CURRENT_DATE)$q$, a_change),
    'change it by typing a reference instead', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT apply_budget_change_request(%L, 2998, %L::uuid)$q$,
           a_change, a_resolution),
    'change it citing a resolution', true);

  -- Declining one. A fresh request, because the function refuses anything no
  -- longer pending -- which is what stops two officers deciding the same
  -- change in opposite directions, and is probed at the end.
  INSERT INTO budget_change_requests(ministry, change_type, proposed_data, requested_by)
  VALUES ('_probe', 'add', '{"project_name":"_probe line 2"}'::jsonb, '_probe')
  RETURNING id INTO a_change;

  PERFORM pg_temp.try_call('budget', outsider, 'EXCO member',
    format($q$SELECT decline_budget_change_request(%L, 'no', %L::uuid)$q$,
           a_change, a_resolution),
    'refuse a change to a budget in force', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT decline_budget_change_request(%L, '  ', %L::uuid)$q$,
           a_change, a_resolution),
    'refuse it with no reason', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT decline_budget_change_request(%L, 'Too costly', NULL::uuid)$q$, a_change),
    'refuse it citing no resolution', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT decline_budget_change_request(%L, 'Too costly', %L::uuid)$q$,
           a_change, future_resolution),
    'refuse it citing a meeting still to come', false);
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT decline_budget_change_request(%L, 'Too costly', 'EXCO/9999/3', CURRENT_DATE)$q$,
           a_change),
    'refuse it by typing a reference instead', false);
  PERFORM pg_temp.try_call('budget', bishop, 'Bishop',
    format($q$SELECT decline_budget_change_request(%L, 'Too costly', %L::uuid)$q$,
           a_change, a_resolution),
    'refuse it citing a resolution', true);

  -- And once it is decided it is decided: the next officer along is told, not
  -- allowed to reverse it. The only thing standing between one decision and
  -- two, since nothing else countersigns.
  PERFORM pg_temp.try_call('budget', treasurer, 'Treasurer',
    format($q$SELECT apply_budget_change_request(%L, 2998, %L::uuid)$q$,
           a_change, a_resolution),
    'change one the Bishop has already refused', false);
  -- A ministry writes its own budget while it is a draft (248), and nobody
  -- else's, ever (247). 237 handed back the proposal and the change request
  -- and left the lines behind, so from 1 October until 248 an EXCO member
  -- could not add a line to their own budget at all.
  DECLARE
    v_mine  text;
    v_other text;
    v_draft uuid;
    v_sub   uuid;
  BEGIN
    SELECT ministries[1] INTO v_mine FROM user_roles WHERE email = exco;
    SELECT name INTO v_other FROM ministries WHERE lower(name) <> lower(v_mine)
     ORDER BY name LIMIT 1;

    INSERT INTO budget_proposals(ministry, year, status, created_by)
    VALUES (v_mine, 2996, 'DRAFT', exco) RETURNING id INTO v_draft;
    INSERT INTO budget_proposals(ministry, year, status, created_by)
    VALUES (v_mine, 2995, 'SUBMITTED', exco) RETURNING id INTO v_sub;

    PERFORM pg_temp.try_insert('budget', exco, 'EXCO member',
      format($q$INSERT INTO budget_items(ministry, project_name, year, estimated_expenses, proposal_id, created_by)
                VALUES (%L, '_probe', 2996, 100, %L, 'x')$q$, v_mine, v_draft),
      'add a line to their own draft', true);

    PERFORM pg_temp.try_insert('budget', exco, 'EXCO member',
      format($q$INSERT INTO budget_items(ministry, project_name, year, estimated_expenses, proposal_id, created_by)
                VALUES (%L, '_probe2', 2995, 100, %L, 'x')$q$, v_mine, v_sub),
      'add a line once it is submitted', false);

    PERFORM pg_temp.try_insert('budget', exco, 'EXCO member',
      format($q$INSERT INTO budget_items(ministry, project_name, year, estimated_expenses, created_by)
                VALUES (%L, '_probe3', 2996, 100, 'x')$q$, v_mine),
      'add a line straight to the live budget', false);

    PERFORM pg_temp.try_update('budget', exco, 'EXCO member',
      format($q$UPDATE budget_proposals SET notes = notes WHERE ministry = %L$q$, v_other),
      'edit another ministry''s proposal', $e$SELECT 0$e$);
  END;

  -- Captured outside the role switch, so the probe inserts a real row. An
  -- INSERT ... SELECT reading a table the probed person cannot see inserts
  -- nothing, raises nothing, and reads as permission: the refusal this file
  -- exists to catch, catching the file itself.
  -- ── Payroll figures ──────────────────────────────────────────────────
  -- Six people may change one: Finance, Accounts, the General Manager, the
  -- Treasurer, the Secretary and the Bishop. The first three keep and run the
  -- payroll; the last three answer for it.
  --
  -- Three tables here carried a FOR ALL policy of `NOT is_guest()` until 256.
  -- Permissive policies are OR-ed, so on the allowances table it sat beside a
  -- policy requiring a finance role and cancelled it, and anybody signed in
  -- could put a monthly allowance on anybody's pay. These probe the thing
  -- itself rather than the policy text, which is the whole point of this file:
  -- the policy text looked right while the table was open.
  PERFORM pg_temp.try_insert('payroll', finance, 'Finance Executive',
    format($q$INSERT INTO payroll_employee_custom_items(employee_id, year, month, label, type, amount)
             VALUES (%L, 2998, 1, '_probe', 'allowance', 1)$q$, an_employee),
    'add an allowance to somebody''s pay', true);
  PERFORM pg_temp.try_insert('payroll', signer, 'Bishop or Treasurer',
    format($q$INSERT INTO payroll_employee_custom_items(employee_id, year, month, label, type, amount)
             VALUES (%L, 2998, 2, '_probe', 'allowance', 1)$q$, an_employee),
    'add an allowance to somebody''s pay', true);
  PERFORM pg_temp.try_insert('payroll', exco, 'EXCO member',
    format($q$INSERT INTO payroll_employee_custom_items(employee_id, year, month, label, type, amount)
             VALUES (%L, 2998, 3, '_probe', 'allowance', 1)$q$, an_employee),
    'add an allowance to somebody''s pay', false);
  PERFORM pg_temp.try_insert('payroll', desk, 'Ministry desk',
    format($q$INSERT INTO payroll_employee_custom_items(employee_id, year, month, label, type, amount)
             VALUES (%L, 2998, 4, '_probe', 'allowance', 1)$q$, an_employee),
    'add an allowance to somebody''s pay', false);

  -- A correction to a figure already paid, which is the same question.
  PERFORM pg_temp.try_insert('payroll', signer, 'Bishop or Treasurer',
    format($q$INSERT INTO payroll_adjustments(employee_id, year, month, category, amount, reason)
             VALUES (%L, 2998, 1, 'EPF_EE', 1, '_probe')$q$, an_employee),
    'correct a figure already paid', true);
  PERFORM pg_temp.try_insert('payroll', exco, 'EXCO member',
    format($q$INSERT INTO payroll_adjustments(employee_id, year, month, category, amount, reason)
             VALUES (%L, 2998, 2, 'EPF_EE', 1, '_probe')$q$, an_employee),
    'correct a figure already paid', false);

  -- Changing a figure means seeing it. Oversight could read a run and its
  -- vouchers but not the salaries behind them, so the sheet they are now
  -- asked to correct would have been empty.
  PERFORM pg_temp.try_count('payroll', signer, 'Bishop or Treasurer',
    'SELECT count(*) FROM payroll_salary', 'read the salaries', 'some');
  PERFORM pg_temp.try_count('payroll', exco, 'EXCO member',
    'SELECT count(*) FROM payroll_salary', 'read the salaries', 'none');

  -- A column heading on a run names no figure, so it stays readable; adding
  -- one does not.
  PERFORM pg_temp.try_insert('payroll', exco, 'EXCO member',
    $q$INSERT INTO payroll_run_custom_defs(label, type) VALUES ('_probe','allowance')$q$,
    'add a column to a payroll run', false);

  -- The voucher that pays your own claim (273).
  --
  -- Finance submits a claim voucher, so the submitter ground never reaches the
  -- claimant, and the ministry ground only does by the accident of which
  -- committee the expense was booked to. Both probes exclude those two
  -- grounds, so what they measure is this policy and nothing else.
  PERFORM pg_temp.try_count('claims', claimant, 'A claimant',
    format($q$
      SELECT count(*) FROM pvs p
       WHERE p.id IN (SELECT pv_id FROM gm_claims
                       WHERE lower(claimant_email) = %L AND pv_id IS NOT NULL)
         AND NOT can_see_ministry_pv(p.ministry)
         AND lower(COALESCE(p.submitted_by_email, '')) <> %L $q$, claimant, claimant),
    'open the voucher paying their own claim', 'some');

  -- And nothing beyond it. A policy written one predicate too wide would pass
  -- the probe above and hand them the whole book.
  PERFORM pg_temp.try_count('claims', claimant, 'A claimant',
    format($q$
      SELECT count(*) FROM pvs p
       WHERE NOT can_see_ministry_pv(p.ministry)
         AND lower(COALESCE(p.submitted_by_email, '')) <> %L
         AND p.id NOT IN (SELECT pv_id FROM gm_claims
                           WHERE lower(claimant_email) = %L AND pv_id IS NOT NULL)
         AND p.id NOT IN (SELECT pv_id FROM purchase_requests
                           WHERE lower(submitted_by_email) = %L AND pv_id IS NOT NULL)
      $q$, claimant, claimant, claimant),
    'read somebody else''s voucher', 'none');

  -- Read only. Seeing the voucher that pays you is not a licence to alter it,
  -- and 273 grants SELECT alone -- an UPDATE matches no row and fails
  -- silently, which is why this is counted rather than trusted.
  PERFORM pg_temp.try_update('claims', claimant, 'A claimant',
    format($q$
      UPDATE pvs SET purpose = '_probe'
       WHERE id IN (SELECT pv_id FROM gm_claims
                     WHERE lower(claimant_email) = %L AND pv_id IS NOT NULL) $q$, claimant),
    'edit the voucher paying their own claim', 'SELECT 0');

END $probe$;

INSERT INTO result(seq, area, who, attempt, got, expected, verdict)
SELECT 0, '-- TALLY --', '', '',
       COUNT(*) FILTER (WHERE verdict = 'PASS') || ' passed',
       COUNT(*) FILTER (WHERE verdict = 'FAIL') || ' failed'
         || CASE WHEN COUNT(*) FILTER (WHERE verdict = 'SKIP') > 0
                 THEN ', ' || COUNT(*) FILTER (WHERE verdict = 'SKIP') || ' skipped'
                 ELSE '' END,
       -- A probe that did not run has not passed. Saying "ALL OK" while a role
       -- nobody holds quietly took two checks with it is how this script would
       -- come to be trusted for something it never did.
       CASE WHEN COUNT(*) FILTER (WHERE verdict = 'FAIL') > 0
                 THEN 'LOOK AT THE FAILURES BELOW'
            WHEN COUNT(*) FILTER (WHERE verdict = 'SKIP') > 0
                 THEN 'NO FAILURES, BUT SOME CHECKS DID NOT RUN'
            ELSE 'ALL OK' END
  FROM result;

SELECT area, who, attempt, got, expected, verdict FROM result ORDER BY seq;

ROLLBACK;
