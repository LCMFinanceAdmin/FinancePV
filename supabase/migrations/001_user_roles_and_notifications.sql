-- user_roles: replaces the hardcoded ROLE_EMAILS constant in server.gs
CREATE TABLE IF NOT EXISTS user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT UNIQUE NOT NULL,
  full_name   TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'STAFF'
                CHECK (role IN ('FINANCE_ADMIN','FINANCE_ADMIN_2','FINANCE_ADMIN_3',
                                'GENERAL_MANAGER','BISHOP','TREASURER','SECRETARY',
                                'MINISTRY_HEAD','STAFF')),
  ministries  TEXT[] DEFAULT '{}',
  pin_hash    TEXT,
  has_pin     BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Users can read all roles (needed to display approver names, ministry heads, etc.)
CREATE POLICY "user_roles_select" ON user_roles FOR SELECT USING (auth.role() = 'authenticated');

-- Only service role can insert/update (managed via admin UI or migration)
CREATE POLICY "user_roles_service_only" ON user_roles FOR ALL USING (auth.role() = 'service_role');

-- notifications: in-app notification inbox
CREATE TABLE IF NOT EXISTS notifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email  TEXT NOT NULL,
  type             TEXT NOT NULL,
  pv_no            TEXT,
  pv_id            UUID REFERENCES pvs(id) ON DELETE SET NULL,
  message          TEXT NOT NULL,
  read             BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users see only their own notifications
CREATE POLICY "notifications_own" ON notifications FOR SELECT
  USING (recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "notifications_service_insert" ON notifications FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "notifications_own_update" ON notifications FOR UPDATE
  USING (recipient_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Index for fast notification inbox queries
CREATE INDEX IF NOT EXISTS notifications_recipient_idx ON notifications(recipient_email, created_at DESC);

-- Add submitted_by_email and submitted_by to pvs if not already present
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS submitted_by_email TEXT DEFAULT '';
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS submitted_by       TEXT DEFAULT '';
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ;
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS loa_required       INT DEFAULT 1;
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS loa_label          TEXT DEFAULT '';

-- Seed initial user roles (update emails to match actual staff)
INSERT INTO user_roles (email, full_name, role) VALUES
  ('finance@lcm.org.my',      'Finance Admin',    'FINANCE_ADMIN'),
  ('finance2@lcm.org.my',     'Finance Admin 2',  'FINANCE_ADMIN_2'),
  ('finance3@lcm.org.my',     'Finance Admin 3',  'FINANCE_ADMIN_3'),
  ('jeff.koit@lcm.org.my',    'Jeff Koit',        'GENERAL_MANAGER'),
  ('bishopthomas@lcm.org.my', 'Bishop Thomas',    'BISHOP'),
  ('treasurer@lcm.org.my',    'Treasurer',        'TREASURER'),
  ('secretary@lcm.org.my',    'Secretary',        'SECRETARY')
ON CONFLICT (email) DO NOTHING;
