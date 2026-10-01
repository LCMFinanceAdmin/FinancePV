-- 237: three tables 236 locked too hard.
--
-- "Finance writes money records" is right for the ledger — the bank accounts,
-- the fixed deposits, the recurring vouchers. It is wrong for the three tables
-- where somebody else is the author and Finance is the reader.
--
-- A ministry proposes its own budget and asks for its own changes; that is
-- the whole point of the Ministry Budget page, which EXCO members reach. And
-- a worksheet of personnel and wages is the Building Manager's, raised before
-- Finance ever sees it.
--
-- Caught by reading the pages rather than the table names. A policy that
-- refuses is silent — the save would simply not have happened, and the person
-- would have been told nothing at all.

-- A seat on the EXCO, by role or by holding a portfolio. Mirrors isExcoRole in
-- lib/utils.ts and the is_exco_role(text) already here, with the portfolio
-- test the app also applies.
CREATE OR REPLACE FUNCTION is_exco_member()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND (is_exco_role(ur.role) OR COALESCE(array_length(ur.ministries, 1), 0) > 0)
  );
$$;

CREATE OR REPLACE FUNCTION is_building_manager()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email') AND ur.role = 'BUILDING_MANAGER'
  );
$$;

REVOKE EXECUTE ON FUNCTION is_exco_member()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_building_manager() FROM PUBLIC, anon;

-- A ministry's own budget papers.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['budget_proposals', 'budget_change_requests'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT WITH CHECK (can_write_money() OR is_exco_member())', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE USING (can_write_money() OR is_exco_member()) WITH CHECK (can_write_money() OR is_exco_member())', t || '_update', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR DELETE USING (can_write_money() OR is_exco_member())', t || '_delete', t);
  END LOOP;
END $$;

-- Personnel worksheets, which the Building Manager raises.
DROP POLICY IF EXISTS worker_worksheets_insert ON worker_worksheets;
DROP POLICY IF EXISTS worker_worksheets_update ON worker_worksheets;
DROP POLICY IF EXISTS worker_worksheets_delete ON worker_worksheets;
CREATE POLICY worker_worksheets_insert ON worker_worksheets FOR INSERT
  WITH CHECK (can_write_money() OR is_building_manager());
CREATE POLICY worker_worksheets_update ON worker_worksheets FOR UPDATE
  USING (can_write_money() OR is_building_manager())
  WITH CHECK (can_write_money() OR is_building_manager());
CREATE POLICY worker_worksheets_delete ON worker_worksheets FOR DELETE
  USING (can_write_money() OR is_building_manager());
