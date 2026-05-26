-- Enhance budget_items table with contributions tracking and notes
-- Adds fields for tracking actual contributions received, expected contributions, and special arrangements

-- Add new columns if they don't exist
ALTER TABLE budget_items
ADD COLUMN IF NOT EXISTS contributions_received DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS contributions_expected DECIMAL(12,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS special_notes TEXT DEFAULT '';

-- Create index on contributions for efficient querying
CREATE INDEX IF NOT EXISTS idx_budget_items_contributions ON budget_items(contributions_received, contributions_expected);
