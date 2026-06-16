-- Fixed Deposit certificates: one account can have multiple certificates
CREATE TABLE fd_certificates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  -- Original certificate
  date_of_issue       DATE NOT NULL,
  certificate_no      TEXT NOT NULL,
  principal           DECIMAL(14,2) NOT NULL DEFAULT 0,
  term_months         INT NOT NULL DEFAULT 12,   -- 1, 3, 6, 9, 12, 24, 36
  interest_rate       DECIMAL(6,4) NOT NULL DEFAULT 0,  -- e.g. 3.7500 (%)
  maturity_date       DATE NOT NULL,
  -- Reissue / roll-over fields (only populated when is_reissued = true)
  is_reissued         BOOLEAN NOT NULL DEFAULT false,
  reissue_date        DATE,
  new_certificate_no  TEXT,
  new_principal       DECIMAL(14,2),
  -- Lifecycle status
  status              TEXT NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | MATURED | WITHDRAWN | REISSUED
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE fd_certificates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fdc_select" ON fd_certificates FOR SELECT TO authenticated USING (true);
CREATE POLICY "fdc_insert" ON fd_certificates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fdc_update" ON fd_certificates FOR UPDATE TO authenticated USING (true);
CREATE POLICY "fdc_delete" ON fd_certificates FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_fdc_account ON fd_certificates(account_id);
CREATE INDEX idx_fdc_status  ON fd_certificates(status);
