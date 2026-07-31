-- 082: Empty folders for the Recurring Expenses library.
-- Folders were previously implicit — they only existed if a recurring item
-- carried that group_name. To let the GM/Finance Executive create folders
-- (and nested sub-folders) up front, before adding any expense, empty folder
-- paths are stored here. A path is the full "Folder / Sub / Sub-sub" string,
-- scoped to an entity (pv_type) and a frequency, matching group_name on items.

CREATE TABLE IF NOT EXISTS recurring_folders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pv_type     TEXT NOT NULL DEFAULT 'LCM',
  frequency   TEXT NOT NULL DEFAULT 'MONTHLY',
  path        TEXT NOT NULL,
  created_by  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (pv_type, frequency, path)
);

ALTER TABLE recurring_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_folders_read"   ON recurring_folders;
CREATE POLICY "recurring_folders_read"   ON recurring_folders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "recurring_folders_insert" ON recurring_folders;
CREATE POLICY "recurring_folders_insert" ON recurring_folders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "recurring_folders_update" ON recurring_folders;
CREATE POLICY "recurring_folders_update" ON recurring_folders FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "recurring_folders_delete" ON recurring_folders;
CREATE POLICY "recurring_folders_delete" ON recurring_folders FOR DELETE TO authenticated USING (true);
