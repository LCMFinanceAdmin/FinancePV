-- 019: Store the submitter's role on each PV so the PDF can conditionally
--      hide the Applicant Signature and EXCO sections for Finance Executives.

ALTER TABLE pvs ADD COLUMN IF NOT EXISTS submitted_by_role TEXT;

-- Backfill existing PVs from user_roles where the email still exists
UPDATE pvs p
SET submitted_by_role = ur.role
FROM user_roles ur
WHERE ur.email = p.submitted_by_email
  AND p.submitted_by_role IS NULL;
