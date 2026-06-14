-- 026: Add description field to recurring_pvs for fuller narrative
ALTER TABLE recurring_pvs ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
