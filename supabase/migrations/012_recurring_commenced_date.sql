-- Add commenced_date to recurring_pvs to track when a recurring expense started
ALTER TABLE recurring_pvs ADD COLUMN IF NOT EXISTS commenced_date DATE;
