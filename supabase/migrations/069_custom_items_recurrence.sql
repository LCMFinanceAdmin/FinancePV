-- Add recurrence support to per-employee custom items.
-- is_recurring = true means the item applies every month from (year, month)
-- through (recur_until_year, recur_until_month). NULL until = no end (perpetual).
ALTER TABLE payroll_employee_custom_items
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recur_until_year INT,
  ADD COLUMN IF NOT EXISTS recur_until_month INT CHECK (recur_until_month BETWEEN 1 AND 13);
