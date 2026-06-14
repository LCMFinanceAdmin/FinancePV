-- 025: Add pv_type to recurring_pvs so BAM recurring expenses are tracked separately
ALTER TABLE recurring_pvs ADD COLUMN IF NOT EXISTS pv_type TEXT DEFAULT 'LCM';
