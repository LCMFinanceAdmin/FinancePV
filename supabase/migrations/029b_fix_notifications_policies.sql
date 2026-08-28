-- 029b: Fix notification RLS so client-side inserts work and all recipients
-- (numbered 029b on cleanup: written after 029a, which already held 029)
-- can read their own notifications.

-- Grant table-level permissions (PostgREST requires both GRANT + policy)
GRANT SELECT, INSERT, UPDATE ON notifications TO authenticated;

-- ── SELECT: each user sees their own; finance/senior roles see all ─────────
DROP POLICY IF EXISTS "notifications_own"         ON notifications;
DROP POLICY IF EXISTS "notifications_read_admin"  ON notifications;
DROP POLICY IF EXISTS "notifications_read"        ON notifications;

CREATE POLICY "notifications_select" ON notifications
  FOR SELECT TO authenticated
  USING (
    recipient_email = (auth.jwt() ->> 'email')
    OR is_finance_admin_or_senior()
  );

-- ── INSERT: any authenticated user can create notifications ───────────────
DROP POLICY IF EXISTS "notifications_service_insert" ON notifications;

CREATE POLICY "notifications_insert" ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── UPDATE: users can update (mark read) their own notifications ──────────
DROP POLICY IF EXISTS "notifications_own_update" ON notifications;

CREATE POLICY "notifications_update" ON notifications
  FOR UPDATE TO authenticated
  USING (recipient_email = (auth.jwt() ->> 'email'));
