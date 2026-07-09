-- 077: Manual override for the annual increment month.
-- Default rule (unchanged): joined before July -> increments every Jan;
-- joined July or later -> increments every July. This column lets Finance
-- override that for individuals the T&C carves out as exceptions.
-- Run manually in the Supabase dashboard SQL editor.

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS increment_month_override INT; -- NULL = automatic; else 1 or 7

ALTER TABLE payroll_employees
  ADD CONSTRAINT chk_increment_override CHECK (increment_month_override IS NULL OR increment_month_override IN (1, 7));
