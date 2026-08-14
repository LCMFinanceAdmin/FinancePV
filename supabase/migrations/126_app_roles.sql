-- 126: roles become editable — as far as they honestly can.
--
-- The list in the Access & Roles picker came from SWITCHABLE_ROLES in
-- lib/utils.ts, with its labels from ROLE_LABELS beside it. Two hardcoded
-- constants, so renaming "EXCO Member", reordering the list, or hiding a role
-- the church does not use all needed a deploy.
--
-- Those are now rows, and this table owns them.
--
-- What this table deliberately does NOT own is what a role may DO. Role names
-- are written into the system 895 times across 84 files — 226 of those inside
-- RLS policies, 186 in the edge functions. A row invented here would appear in
-- every picker and grant nothing at all: no policy would recognise it, no queue
-- would list its work, no approval would accept its signature. Creating a role
-- that actually means something is a code change, and pretending otherwise
-- would produce accounts that look privileged and are not — which is worse than
-- not offering it.
--
-- So: rename, describe, reorder, and control which roles can be handed out.
-- `is_system` marks the ones the code knows about, and they cannot be deleted.

CREATE TABLE IF NOT EXISTS app_roles (
  key         TEXT PRIMARY KEY,
  label       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- Whether this role can be handed out in the pickers. Lets the church retire
  -- a role from use without deleting it — accounts that hold it keep working
  -- and keep displaying correctly, which a delete would break.
  assignable  BOOLEAN NOT NULL DEFAULT TRUE,
  -- Recognised by the code. These cannot be removed, because removing one
  -- would not remove the permissions attached to its name.
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order  INT NOT NULL DEFAULT 500,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The twelve the code knows, in the order the picker used, with the labels it
-- used. FINANCE_ADMIN_3 is included: it has permissions throughout the app and
-- RLS but was left out of SWITCHABLE_ROLES, so it could never be assigned. It
-- ships not-assignable rather than silently appearing — whether the church
-- wants a third finance seat is their decision, not a side effect of this.
INSERT INTO app_roles (key, label, description, assignable, is_system, sort_order) VALUES
  ('FINANCE_ADMIN',    'Finance Executive',        'Runs the finance desk — reviews vouchers, issues payments, keeps the settings', TRUE,  TRUE, 10),
  ('FINANCE_ADMIN_2',  'Accounts Executive',       'Finance without the decisions — owns voucher numbering, payroll and the directories', TRUE, TRUE, 20),
  ('FINANCE_ADMIN_3',  'Finance Executive 3',      'A third finance seat. Recognised everywhere the other two are, but never offered in a picker until now.', FALSE, TRUE, 30),
  ('ADMINISTRATOR',    'Administrator',            'Keeps the directories and oversees leave. Approves no money', TRUE,  TRUE, 40),
  ('GENERAL_MANAGER',  'General Manager',          'Accepts claims and instructs Finance; signs as an officer', TRUE,  TRUE, 50),
  ('BISHOP',           'Bishop',                   'Signs vouchers as an officer of the church', TRUE,  TRUE, 60),
  ('TREASURER',        'Treasurer',                'Signs vouchers, and approves next year''s budgets', TRUE,  TRUE, 70),
  ('SECRETARY',        'Secretary',                'Signs vouchers as an officer of the church', TRUE,  TRUE, 80),
  ('MINISTRY_HEAD',    'EXCO Member',              'Verifies their own ministry''s spending against its budget', TRUE, TRUE, 90),
  ('BUILDING_MANAGER', 'Building / Event Manager', 'Building and event vouchers, bookings and facilities', TRUE,  TRUE, 100),
  ('BAM_COMMITTEE',    'BAM Committee',            'Reviews building and asset vouchers', TRUE,  TRUE, 110),
  ('STAFF',            'Staff',                    'Submits vouchers and claims; approves nothing', TRUE,  TRUE, 120)
ON CONFLICT (key) DO NOTHING;

-- A role in use cannot be deleted, and neither can one the code knows about.
-- The first would orphan accounts; the second would remove the name without
-- removing the permissions written against it.
CREATE OR REPLACE FUNCTION guard_app_role_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_held INT;
BEGIN
  IF OLD.is_system THEN
    RAISE EXCEPTION 'The % role is built into the app and cannot be deleted. Untick "can be assigned" to take it out of use.', OLD.label;
  END IF;
  SELECT count(*) INTO v_held FROM user_roles WHERE role = OLD.key;
  IF v_held > 0 THEN
    RAISE EXCEPTION '% people still hold the % role. Move them first.', v_held, OLD.label;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_role_delete ON app_roles;
CREATE TRIGGER trg_app_role_delete
  BEFORE DELETE ON app_roles
  FOR EACH ROW EXECUTE FUNCTION guard_app_role_delete();

ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_roles_read"  ON app_roles;
DROP POLICY IF EXISTS "app_roles_write" ON app_roles;
-- Readable by anyone signed in: every page that shows a role name needs the label.
CREATE POLICY "app_roles_read"  ON app_roles FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_roles_write" ON app_roles FOR ALL TO authenticated
  USING (can_manage_people()) WITH CHECK (can_manage_people());

GRANT SELECT, INSERT, UPDATE, DELETE ON app_roles TO authenticated;

COMMENT ON TABLE app_roles IS
  'Display and assignability of the app''s roles. What each role may DO lives in code and RLS — this table cannot grant anything.';
