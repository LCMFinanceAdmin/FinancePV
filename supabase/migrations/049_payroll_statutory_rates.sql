-- 049: Payroll — admin-editable statutory rate config per year.
-- Lets Finance update EPF/SOCSO/EIS rates & ceilings when the government changes policy,
-- without code changes. Rates stored as fractions (0.11 = 11%).

CREATE TABLE payroll_statutory_rates (
  year                  INT PRIMARY KEY,

  -- EPF tiers (employee %, employer %)
  epf_ee_under60        DECIMAL(6,4) NOT NULL DEFAULT 0.11,
  epf_er_under60        DECIMAL(6,4) NOT NULL DEFAULT 0.16,   -- 13% govt + 3% LCM
  epf_ee_over60         DECIMAL(6,4) NOT NULL DEFAULT 0.00,
  epf_er_over60         DECIMAL(6,4) NOT NULL DEFAULT 0.07,   -- 4% govt + 3% LCM
  epf_ee_orang_asli     DECIMAL(6,4) NOT NULL DEFAULT 0.11,
  epf_er_orang_asli     DECIMAL(6,4) NOT NULL DEFAULT 0.13,   -- no +3% LCM

  -- SOCSO
  socso_ee              DECIMAL(6,4) NOT NULL DEFAULT 0.005,
  socso_er              DECIMAL(6,4) NOT NULL DEFAULT 0.0175,
  socso_er_over60       DECIMAL(6,4) NOT NULL DEFAULT 0.0125, -- employment-injury only
  socso_ceiling         DECIMAL(12,2) NOT NULL DEFAULT 6000,

  -- EIS
  eis_rate              DECIMAL(6,4) NOT NULL DEFAULT 0.002,  -- each side
  eis_ceiling           DECIMAL(12,2) NOT NULL DEFAULT 6000,

  updated_by            TEXT NOT NULL DEFAULT '',
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- Seed current + previous year with the defaults.
INSERT INTO payroll_statutory_rates (year) VALUES
  (EXTRACT(YEAR FROM NOW())::INT),
  (EXTRACT(YEAR FROM NOW())::INT - 1)
ON CONFLICT (year) DO NOTHING;

ALTER TABLE payroll_statutory_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "psr_select" ON payroll_statutory_rates FOR SELECT TO authenticated USING (true);
CREATE POLICY "psr_insert" ON payroll_statutory_rates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "psr_update" ON payroll_statutory_rates FOR UPDATE TO authenticated USING (true);
