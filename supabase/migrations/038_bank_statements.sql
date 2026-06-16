-- Monthly bank statements: one PDF per account per month
CREATE TABLE bank_statements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  statement_month DATE NOT NULL,          -- first day of month: 2025-01-01
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,          -- path within storage bucket
  file_size       INT,                    -- bytes
  uploaded_by     TEXT,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW(),
  notes           TEXT,
  UNIQUE(account_id, statement_month)
);

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bs_select" ON bank_statements FOR SELECT TO authenticated USING (true);
CREATE POLICY "bs_insert" ON bank_statements FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bs_update" ON bank_statements FOR UPDATE TO authenticated USING (true);
CREATE POLICY "bs_delete" ON bank_statements FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_bs_account ON bank_statements(account_id);
CREATE INDEX idx_bs_month   ON bank_statements(statement_month DESC);
