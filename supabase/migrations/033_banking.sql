-- Banking module: track bank accounts, balances, and FD maturity

CREATE TABLE bank_accounts (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                      TEXT NOT NULL,          -- e.g. "Main Collection Account"
  bank_name                 TEXT NOT NULL,          -- e.g. "Maybank"
  account_type              TEXT NOT NULL DEFAULT 'CURRENT',  -- 'CURRENT' | 'FIXED_DEPOSIT'
  account_no                TEXT,                   -- account number (for reference)
  entity                    TEXT NOT NULL DEFAULT 'LCM',
  -- 'LCM' | 'BAM' | 'LUTHERAN_GARDEN' | 'STUDY_CENTRE' | 'GENERAL'
  purpose                   TEXT,
  current_balance           DECIMAL(14,2) NOT NULL DEFAULT 0,
  last_updated_at           TIMESTAMPTZ DEFAULT NOW(),
  last_updated_by           TEXT,
  -- Fixed Deposit fields
  fd_principal              DECIMAL(14,2),
  fd_interest_rate          DECIMAL(6,4),           -- e.g. 3.7500 (%)
  fd_tenure_months          INT,
  fd_placement_date         DATE,
  fd_maturity_date          DATE,
  fd_renewal_reminder_days  INT NOT NULL DEFAULT 30,
  fd_cert_no                TEXT,                   -- FD certificate number
  -- Cashflow calculator reference flags
  is_lcm_cashflow_ref       BOOLEAN NOT NULL DEFAULT false,
  is_bam_cashflow_ref       BOOLEAN NOT NULL DEFAULT false,
  is_active                 BOOLEAN NOT NULL DEFAULT true,
  sort_order                INT NOT NULL DEFAULT 0,
  notes                     TEXT,
  created_at                TIMESTAMPTZ DEFAULT NOW(),
  updated_at                TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bank_read"   ON bank_accounts FOR SELECT TO authenticated USING (true);
CREATE POLICY "bank_insert" ON bank_accounts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "bank_update" ON bank_accounts FOR UPDATE TO authenticated USING (true);

-- Seed the known LCM bank accounts with 0 balances
-- Finance Executive should update balances after setup
INSERT INTO bank_accounts
  (name, bank_name, account_type, entity, purpose, is_lcm_cashflow_ref, is_bam_cashflow_ref, sort_order)
VALUES
  -- Current Accounts
  ('Main Collection Account',  'Maybank',        'CURRENT', 'LCM',            'Primary LCM collection account for various LCM matters',             false, false,  1),
  ('BAM Current Account',      'Maybank',        'CURRENT', 'BAM',            'Dedicated account for BAM (Building & Asset Management) transactions', false, true,   2),
  ('Disbursement Account',     'Public Bank',    'CURRENT', 'LCM',            'LCM transaction disbursements only (cashflow reference for LCM PVs)', true,  false,  3),
  ('Lutheran Garden Account',  'Hong Leong Bank','CURRENT', 'LUTHERAN_GARDEN','Dedicated for Lutheran Garden Berhad matters',                        false, false,  4),
  ('FD Access Account',        'Affin Bank',     'CURRENT', 'GENERAL',        'Opened to facilitate Fixed Deposit with Affin Bank',                  false, false,  5),
  ('Study Centre Account',     'RHB Bank',       'CURRENT', 'STUDY_CENTRE',   'Dedicated for Lutheran Study Centre matters',                          false, false,  6),
  -- Fixed Deposits
  ('Maybank FD',               'Maybank',        'FIXED_DEPOSIT', 'LCM',            'Fixed Deposit (LCM Main Account)',       false, false, 10),
  ('Public Bank FD',           'Public Bank',    'FIXED_DEPOSIT', 'LCM',            'Fixed Deposit with Public Bank',         false, false, 11),
  ('Hong Leong Bank FD',       'Hong Leong Bank','FIXED_DEPOSIT', 'LUTHERAN_GARDEN','Fixed Deposit for Lutheran Garden Berhad', false, false, 12),
  ('Affin Bank FD',            'Affin Bank',     'FIXED_DEPOSIT', 'GENERAL',        'Fixed Deposit with Affin Bank',          false, false, 13),
  ('RHB Bank FD',              'RHB Bank',       'FIXED_DEPOSIT', 'STUDY_CENTRE',   'Fixed Deposit for Lutheran Study Centre', false, false, 14);
