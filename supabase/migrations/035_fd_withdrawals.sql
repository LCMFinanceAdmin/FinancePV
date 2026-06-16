-- Fixed Deposit withdrawals: tracked per certificate
CREATE TABLE fd_withdrawals (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id        UUID NOT NULL REFERENCES fd_certificates(id) ON DELETE CASCADE,
  withdrawal_date       DATE NOT NULL,
  credit_to_account_id  UUID REFERENCES bank_accounts(id),
  amount_credited       DECIMAL(14,2) NOT NULL DEFAULT 0,
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fd_withdrawals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fdw_select" ON fd_withdrawals FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdw_insert" ON fd_withdrawals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fdw_update" ON fd_withdrawals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "fdw_delete" ON fd_withdrawals FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_fdw_cert ON fd_withdrawals(certificate_id);
