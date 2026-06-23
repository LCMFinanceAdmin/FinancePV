-- 047: Payroll — extra employee fields (staff category, EPF no., TIN)

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS is_staff BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS epf_no   TEXT    NOT NULL DEFAULT '',  -- employee EPF account no.
  ADD COLUMN IF NOT EXISTS tin      TEXT    NOT NULL DEFAULT '';  -- employee tax identification no.
