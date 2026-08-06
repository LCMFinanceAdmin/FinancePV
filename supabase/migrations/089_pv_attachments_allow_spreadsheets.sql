-- 089: Allow spreadsheets as PV attachments.
--
-- The pv-attachments bucket accepted only PDF and images. Payroll now attaches
-- the ECP bank file and the statutory contribution summaries to its payment
-- vouchers, both of which are .xlsx — without this the uploads are rejected and
-- the vouchers reach the approvers with nothing supporting them.
--
-- Word and CSV are included on the same basis: they are ordinary supporting
-- documents that people already try to attach.

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
  'application/vnd.ms-excel',                                          -- .xls
  'text/csv',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
  'application/msword'
]
WHERE id = 'pv-attachments';
