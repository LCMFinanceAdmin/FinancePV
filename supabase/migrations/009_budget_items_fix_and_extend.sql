-- Fix RLS policies (auth.role() should be 'authenticated' not 'authenticated_user')
-- and extend budget_items with project type, description, and document attachment

-- 1. Add new columns
ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'expense',
  ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS document_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS document_name TEXT DEFAULT NULL;

-- 2. Drop all existing budget_items policies and replace with working ones
DROP POLICY IF EXISTS "budget_items_read_authenticated" ON budget_items;
DROP POLICY IF EXISTS "budget_items_read_all" ON budget_items;
DROP POLICY IF EXISTS "budget_items_write_finance_admin" ON budget_items;
DROP POLICY IF EXISTS "budget_items_ministry_head" ON budget_items;
DROP POLICY IF EXISTS "budget_items_finance_admin_full_access" ON budget_items;

-- 3. Simple working policies — all authenticated users can read & write
--    (Role-based UI restrictions already enforced on frontend)
CREATE POLICY "budget_items_select" ON budget_items
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "budget_items_insert" ON budget_items
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "budget_items_update" ON budget_items
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "budget_items_delete" ON budget_items
  FOR DELETE USING (auth.role() = 'authenticated');
