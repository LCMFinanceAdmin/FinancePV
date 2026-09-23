-- 230: EPF's Third Schedule changes shape at RM5,000.
--
-- The calculation put every wage into an RM20 band and took 16% from the
-- employer. That is right up to RM5,000 and wrong above it: EPF's table steps
-- in RM100 from there, and the statutory employer share drops from 13% to
-- 12%. LCM pays three points above statutory — which is why the employer rate
-- is 16% and not 13% — so its own rate steps down with it, to 15%. The
-- employee's 11% does not move.
--
-- Six people on the October payroll earn above the threshold. For the four
-- the ordinary rate reaches, we were overstating the employer's share by
-- RM50 to RM62 a month each and understating the employee's by RM8.
--
-- The Orang Asli rate above the threshold is the bare statutory 12%, for the
-- same reason their rate below it is the bare statutory 13% rather than 16%.
-- Nobody on the payroll earns above the threshold on that rate today, so it
-- is the one figure here no payslip has confirmed.
--
-- The over-60 rate does not step: 4% statutory plus three is 7% either side.

ALTER TABLE payroll_statutory_rates
  ADD COLUMN IF NOT EXISTS epf_wage_threshold NUMERIC(10,2) NOT NULL DEFAULT 5000,
  ADD COLUMN IF NOT EXISTS epf_er_under60_over_threshold NUMERIC(6,4) NOT NULL DEFAULT 0.15,
  ADD COLUMN IF NOT EXISTS epf_er_orang_asli_over_threshold NUMERIC(6,4) NOT NULL DEFAULT 0.12;

COMMENT ON COLUMN payroll_statutory_rates.epf_wage_threshold IS
  'Wage above which EPF''s Third Schedule steps in RM100 rather than RM20 and '
  'the employer rate drops a point. A wage of exactly this amount is still in '
  'the lower table.';
COMMENT ON COLUMN payroll_statutory_rates.epf_er_under60_over_threshold IS
  'Employer rate above the threshold: statutory 12% plus LCM''s three points.';
COMMENT ON COLUMN payroll_statutory_rates.epf_er_orang_asli_over_threshold IS
  'Orang Asli employer rate above the threshold: plain statutory 12%, with no '
  'three points added, matching the 13% used below the threshold.';
