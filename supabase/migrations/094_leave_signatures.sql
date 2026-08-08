-- 094: The leave application becomes a signed form.
--
-- Leave was approved by clicking a button, which left nothing on the record
-- that reads as a signature. HR files a leave form; an auditor expects to see
-- the applicant's hand and each approving officer's hand on the same sheet.
--
-- The applicant's signature is a column. Approvers' signatures ride inside the
-- existing `approvals` JSONB alongside the decision they belong to, because a
-- signature without its decision is meaningless — keeping them together means
-- they can never be separated or mismatched.

ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS applicant_signature TEXT;

-- Positions are captured on the application when it is submitted, so the
-- printed form still says "General Manager" years later even after the post
-- has changed hands. required_approvers entries gain a `position` key; no
-- schema change is needed for JSONB, but existing rows have none, so the UI
-- falls back to the person's current role.
COMMENT ON COLUMN leave_applications.required_approvers IS
  'Snapshot of who must approve: [{email, name, position, external?}]';
COMMENT ON COLUMN leave_applications.approvals IS
  'Decisions taken: [{email, name, position, action, timestamp, remarks, signature_data, for_email?}]';
