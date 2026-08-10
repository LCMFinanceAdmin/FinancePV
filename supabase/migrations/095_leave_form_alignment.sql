-- 095: Align leave with the church's printed Leave Application Form.
--
-- The form asks for the applicant's remaining Annual and Medical leave "before
-- this application". That is a point-in-time fact, so it is captured when the
-- application is submitted rather than recalculated later — recalculating would
-- silently rewrite a signed document as the year went on.

ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS balance_annual_before  NUMERIC(5,1),
  ADD COLUMN IF NOT EXISTS balance_medical_before NUMERIC(5,1);

-- The form lists nine leave types; the system had six. The four below were
-- missing, so an applicant had to pick something inaccurate. Entitlement is 0
-- where the church grants days case by case rather than annually.
INSERT INTO leave_types (code, name, days_per_year, is_replacement, requires_doc, sort_order) VALUES
  ('HOSPITALISATION', 'Hospitalization Leave', 0, FALSE, TRUE,  7),
  ('COMPASSIONATE',   'Compassionate Leave',   0, FALSE, TRUE,  8),
  ('STUDY',           'Study Leave',           0, FALSE, TRUE,  9),
  ('UNPAID',          'Unpaid Leave',          0, FALSE, FALSE, 10)
ON CONFLICT (code) DO NOTHING;

-- Note 2 on the form: everything other than Annual Leave must be supported by
-- documents. Emergency Leave is called out again in note 3.
UPDATE leave_types SET requires_doc = TRUE
  WHERE code IN ('MEDICAL', 'MATERNITY', 'EMERGENCY', 'HOSPITALISATION', 'COMPASSIONATE', 'STUDY');

COMMENT ON COLUMN leave_applications.balance_annual_before IS
  'Annual leave days remaining when this application was submitted (printed on the form)';
COMMENT ON COLUMN leave_applications.balance_medical_before IS
  'Medical leave days remaining when this application was submitted (printed on the form)';
