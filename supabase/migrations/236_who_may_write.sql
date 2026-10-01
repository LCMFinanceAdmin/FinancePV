-- 236: Finance writes the money, the Administrator writes the reference data,
-- everybody else reads.
--
-- Twenty-five tables were writable by any signed-in account with no further
-- condition — thirty-four fixed deposit certificates, twelve bank accounts,
-- fifty-three recurring vouchers, the budget, the income records. Reads were
-- already thought about: almost every SELECT policy says NOT is_guest(). The
-- writes were not; they say `true`.
--
-- Nothing here changes who can SEE anything. Where a read policy was missing
-- because one ALL policy covered everything, it is restored as NOT is_guest(),
-- which is what the rest of the schema already says.
--
-- Two predicates rather than a role list repeated twenty-five times. A list
-- repeated is a list that drifts, and this one decides who may alter the
-- church's financial records.

-- Who may write a money record: the finance desk.
CREATE OR REPLACE FUNCTION can_write_money()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3')
  );
$$;

-- Who may write reference data: the Administrator, who keeps the registers,
-- and the Finance Executive, whose Lookups page has always maintained them.
-- The Accounts Executive is out, for the same reason she cannot review a
-- voucher: she records payments, she does not decide what the lists say.
CREATE OR REPLACE FUNCTION can_write_reference()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role IN ('ADMINISTRATOR', 'FINANCE_ADMIN', 'FINANCE_ADMIN_3')
  );
$$;

REVOKE EXECUTE ON FUNCTION can_write_money()     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION can_write_reference() FROM PUBLIC, anon;

-- ── Money records ───────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bank_accounts', 'bank_statements', 'fd_certificates', 'fd_withdrawals',
    'income_records', 'budget_items', 'budget_proposals', 'budget_change_requests',
    'recurring_expenses', 'recurring_pvs', 'recurring_runs', 'recurring_folders',
    'bulk_pv_runs', 'worker_worksheets', 'employee_documents'
  ] LOOP
    -- Every existing policy on the table goes, so nothing permissive is left
    -- behind to shadow the new rule. Reads are put back below.
    EXECUTE format(
      'DO $inner$ DECLARE p RECORD; BEGIN
         FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = ''public'' AND tablename = %L
         LOOP EXECUTE format(''DROP POLICY IF EXISTS %%I ON %I'', p.policyname); END LOOP;
       END $inner$;', t, t);

    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (NOT is_guest())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (can_write_money())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (can_write_money()) WITH CHECK (can_write_money())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (can_write_money())', t || '_delete', t);
  END LOOP;
END $$;

-- ── Reference data ──────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['departments', 'projects', 'facility_rates', 'facility_blocks', 'gm_committees'] LOOP
    EXECUTE format(
      'DO $inner$ DECLARE p RECORD; BEGIN
         FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = ''public'' AND tablename = %L
         LOOP EXECUTE format(''DROP POLICY IF EXISTS %%I ON %I'', p.policyname); END LOOP;
       END $inner$;', t, t);

    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (NOT is_guest())', t || '_read', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (can_write_reference())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (can_write_reference()) WITH CHECK (can_write_reference())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (can_write_reference())', t || '_delete', t);
  END LOOP;
END $$;

-- ── Ministries: reference data with one more door ───────────────────────
--
-- An EXCO Member appoints the person who checks their ministry's vouchers, and
-- that write lands on this table. Locking it to the Administrator would have
-- taken the appointment away from the people whose appointment it is. Which
-- columns they may touch is already settled by the trigger from migration 232;
-- this only says they may reach the row at all.
DROP POLICY IF EXISTS ministries_all ON ministries;
CREATE POLICY ministries_read   ON ministries FOR SELECT USING (NOT is_guest());
CREATE POLICY ministries_insert ON ministries FOR INSERT WITH CHECK (can_write_reference());
CREATE POLICY ministries_delete ON ministries FOR DELETE USING (can_write_reference());
CREATE POLICY ministries_update ON ministries FOR UPDATE
  USING (can_write_reference() OR can_manage_ministry_verifiers(name))
  WITH CHECK (can_write_reference() OR can_manage_ministry_verifiers(name));

-- The General Manager, for his own queue below. No is_role() helper exists and
-- one general enough to deserve the name is a bigger decision than this
-- migration; this is the one role it needs.
CREATE OR REPLACE FUNCTION is_general_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email') AND ur.role = 'GENERAL_MANAGER'
  );
$$;
REVOKE EXECUTE ON FUNCTION is_general_manager() FROM PUBLIC, anon;

-- ── GM claims: the General Manager's own inbox ──────────────────────────
--
-- He records what he has accepted; Finance raises the voucher from it. Finance
-- alone would have locked him out of his own queue.
DROP POLICY IF EXISTS gm_claims_insert ON gm_claims;
DROP POLICY IF EXISTS gm_claims_update ON gm_claims;
DROP POLICY IF EXISTS gm_claims_delete ON gm_claims;
CREATE POLICY gm_claims_insert ON gm_claims FOR INSERT
  WITH CHECK (can_write_money() OR is_general_manager());
CREATE POLICY gm_claims_update ON gm_claims FOR UPDATE
  USING (can_write_money() OR is_general_manager())
  WITH CHECK (can_write_money() OR is_general_manager());
CREATE POLICY gm_claims_delete ON gm_claims FOR DELETE
  USING (can_write_money() OR is_general_manager());

-- ── Push subscriptions ──────────────────────────────────────────────────
--
-- push_subs_own already scopes a person to their own devices. The two policies
-- beside it were USING (true) and named for the service role, which bypasses
-- RLS and never needed them — the same mistake as the credentials table, and
-- this one let anybody delete anybody's subscriptions.
DROP POLICY IF EXISTS push_subs_service_delete ON push_subscriptions;
DROP POLICY IF EXISTS push_subs_service_read   ON push_subscriptions;
