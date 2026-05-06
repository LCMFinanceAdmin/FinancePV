-- Missing columns for recurring_pvs (used by the recurring expenses page)
ALTER TABLE recurring_pvs
  ADD COLUMN IF NOT EXISTS pv_label           TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS term_type          TEXT DEFAULT 'INFINITE'
                             CHECK (term_type IN ('INFINITE', 'FIXED')),
  ADD COLUMN IF NOT EXISTS term_end_date      DATE,
  ADD COLUMN IF NOT EXISTS final_payment_note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_pv_no      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS current_pv_status  TEXT DEFAULT '';

-- Link PVs back to their recurring template
ALTER TABLE pvs
  ADD COLUMN IF NOT EXISTS recurring_id UUID REFERENCES recurring_pvs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pvs_recurring_id_idx ON pvs(recurring_id);

-- RLS policy fix: allow authenticated users to update recurring_pvs they own
-- (needed for "Run Now" updating last_run / next_due)
DROP POLICY IF EXISTS "recurring_pvs_admin" ON recurring_pvs;
CREATE POLICY "recurring_pvs_read" ON recurring_pvs FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "recurring_pvs_write" ON recurring_pvs FOR ALL
  USING (auth.role() = 'authenticated');
