-- Allow master bulk_pv_runs records to store their own GM/Signatory approvals
ALTER TABLE bulk_pv_runs
  ADD COLUMN IF NOT EXISTS approvals JSONB DEFAULT '[]';
