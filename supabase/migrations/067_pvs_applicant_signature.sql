-- 067: Add applicant_signature_data column to pvs.
--
-- The submit form captures a digital signature from the applicant
-- but had nowhere to store it. This column holds the base64 PNG data-URI
-- so it can be rendered in the Applicant's Signature box on the PV PDF.

ALTER TABLE pvs
  ADD COLUMN IF NOT EXISTS applicant_signature_data TEXT;
