-- Store the payment period label for the current recurring cycle
ALTER TABLE recurring_pvs ADD COLUMN IF NOT EXISTS current_period TEXT;
