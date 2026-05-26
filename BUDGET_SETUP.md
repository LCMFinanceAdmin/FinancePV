# Budget Management Setup

This document outlines the setup required for the Budget Management feature.

## What Was Added

1. **Budget Management Page** - `/control-center/budget`
   - Ministry Heads can create and manage project budgets
   - Finance Admin and senior roles can view all budgets
   - Real-time balance tracking with color indicators

2. **Database Migration** - `supabase/migrations/006_budget_items.sql`
   - Creates `budget_items` table
   - Includes Row Level Security policies
   - Indexes for efficient querying

3. **PV Form Integration**
   - Projects now load from `budget_items` instead of `ministry_projects`
   - Links to Budget Management page for creating/managing budgets

## Setup Steps

### 1. Run the Migration

Run the following SQL in Supabase SQL Editor to create the budget_items table:

```sql
-- From: supabase/migrations/006_budget_items.sql
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

CREATE INDEX IF NOT EXISTS idx_budget_items_ministry ON budget_items(ministry);
CREATE INDEX IF NOT EXISTS idx_budget_items_project_name ON budget_items(project_name);

-- Enable RLS
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

-- Policy 1: Authenticated users can read all budgets
CREATE POLICY IF NOT EXISTS "budget_items_read_authenticated" ON budget_items
  FOR SELECT
  USING (auth.role() = 'authenticated_user');

-- Policy 2: Finance Admin can manage all budgets
CREATE POLICY IF NOT EXISTS "budget_items_write_finance_admin" ON budget_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.email = auth.jwt() ->> 'email'
      AND user_roles.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3')
    )
  );

-- Policy 3: Ministry Heads can manage budgets for their ministry
CREATE POLICY IF NOT EXISTS "budget_items_ministry_head" ON budget_items
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_roles.email = auth.jwt() ->> 'email'
      AND user_roles.role = 'MINISTRY_HEAD'
      AND user_roles.ministry = budget_items.ministry
    )
  );
```

### 2. Access the Budget Management Page

- Finance Admin and authorized users can access `/control-center/budget`
- Ministry Heads can create budgets for their ministry
- Budget items appear as projects in the PV submission form

### 3. Create Initial Budgets

1. Go to Control Center → Budget Management
2. Select a ministry from the tab bar
3. Click "Add Budget" to create a new budget item
4. Enter:
   - Project Name (e.g., "Soup Kitchen 2026")
   - Estimated Income (e.g., 5000)
   - Estimated Expenses (e.g., 3000)
5. Save and repeat for each project

## Features

### Budget Tracking
- Real-time balance calculation as PVs are submitted
- Color-coded indicators:
  - 🔴 Red: Over budget (negative balance)
  - 🟡 Yellow: Low remaining (≤RM200)
  - 🟢 Green: Healthy budget (> RM200 remaining)

### Role-Based Access
- **MINISTRY_HEAD**: Create/edit budgets for their ministry only
- **FINANCE_ADMIN**, **GENERAL_MANAGER**, **TREASURER**, **BISHOP**, **SECRETARY**: View all budgets
- All authenticated users: View budget balance in PV forms

### PV Integration
- When submitting a PV under Ministry → Project, the budget balance updates
- Projects are now loaded from the Budget Management system
- Users can manage budgets directly from the PV form

## Migration from ministry_projects

The old `ministry_projects` table is deprecated but kept for backward compatibility.

**To migrate existing projects to budgets:**

1. Export data from `ministry_projects`
2. Manually create corresponding budget items via the Budget Management UI
3. Once all budgets are set up, projects will automatically appear in PV forms

## Notes

- Budget items use decimal fields for income/expenses
- Spending is calculated from APPROVED and PAID PVs
- Ministry can have multiple projects/budgets
- Each budget item tracks cumulative spending across all PVs for that project
