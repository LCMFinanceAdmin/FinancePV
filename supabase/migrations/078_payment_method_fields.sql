-- 078: Payment-method-specific fields.
-- - pvs.ref_no already exists; add a second reference field for JomPay
--   payments (Biller Code + Ref-1 + Ref-2).
-- - recurring_pvs gains the same biller_code/ref_no/ref_no_2/cheque_no
--   fields as pvs, so recurring templates can carry them through when a
--   template is run into an actual PV.
-- Run manually in the Supabase dashboard SQL editor.

ALTER TABLE pvs
  ADD COLUMN IF NOT EXISTS ref_no_2 TEXT NOT NULL DEFAULT '';

ALTER TABLE recurring_pvs
  ADD COLUMN IF NOT EXISTS biller_code TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ref_no TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ref_no_2 TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cheque_no TEXT NOT NULL DEFAULT '';
