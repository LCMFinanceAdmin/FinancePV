-- Create budget_items table for ministry budget tracking
-- This table stores annual budgets per project/ministry
-- Ministry Heads allocate estimated income and expenses per project

CREATE TABLE IF NOT EXISTS budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry TEXT NOT NULL,
  project_name TEXT NOT NULL,
  estimated_income DECIMAL(12,2) DEFAULT 0,
  estimated_expenses DECIMAL(12,2) DEFAULT 0,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for efficient ministry filtering
CREATE INDEX idx_budget_items_ministry ON budget_items(ministry);
CREATE INDEX idx_budget_items_project_name ON budget_items(project_name);

-- RLS: Enable Row Level Security
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Authenticated users can read all budgets
CREATE POLICY "budget_items_read_authenticated" ON budget_items
  FOR SELECT
  USING (auth.role() = 'authenticated_user');

-- RLS Policy: Finance Admin can manage all budgets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'budget_items' AND policyname = 'budget_items_write_finance_admin'
  ) THEN
    CREATE POLICY "budget_items_write_finance_admin" ON budget_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.email = auth.jwt() ->> 'email'
          AND user_roles.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3')
        )
      );
  END IF;
END $$;

-- RLS Policy: Ministry Heads can manage budgets for their ministry
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'budget_items' AND policyname = 'budget_items_ministry_head'
  ) THEN
    CREATE POLICY "budget_items_ministry_head" ON budget_items
      FOR ALL
      USING (
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.email = auth.jwt() ->> 'email'
          AND user_roles.role = 'MINISTRY_HEAD'
          AND user_roles.ministry = budget_items.ministry
        )
      );
  END IF;
END $$;
