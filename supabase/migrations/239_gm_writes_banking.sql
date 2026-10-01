-- 239: the General Manager writes banking.
--
-- 236 read "Finance writes money records" strictly and took the Banking page
-- away from him. He could still open it — the nav shows it to him and the page
-- has no gate of its own — so the buttons were there and the saves would have
-- gone nowhere, silently.
--
-- Banking is four tables, not two: the page carries the bank accounts and
-- statements and the fixed deposit certificates and withdrawals, all under one
-- heading. Handing back two of the four would have left him pressing a dead
-- button on the other half, which is the thing being fixed.
--
-- The rest of the money set is unchanged: income, the budget, recurring
-- vouchers, bulk runs, employee documents and worksheets stay with Finance.

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['bank_accounts', 'bank_statements', 'fd_certificates', 'fd_withdrawals'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', t || '_delete', t);

    EXECUTE format(
      'CREATE POLICY %I ON %I FOR INSERT WITH CHECK (can_write_money() OR is_general_manager())',
      t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR UPDATE USING (can_write_money() OR is_general_manager()) '
      'WITH CHECK (can_write_money() OR is_general_manager())',
      t || '_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR DELETE USING (can_write_money() OR is_general_manager())',
      t || '_delete', t);
  END LOOP;
END $$;
