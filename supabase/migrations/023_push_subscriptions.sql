-- Push notification subscriptions per device/browser
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  endpoint   TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_email, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_email ON push_subscriptions(user_email);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own subscriptions
CREATE POLICY "push_subs_own" ON push_subscriptions
  FOR ALL TO authenticated
  USING (user_email = auth.email())
  WITH CHECK (user_email = auth.email());

-- Service role can read all (for sending notifications)
CREATE POLICY "push_subs_service_read" ON push_subscriptions
  FOR SELECT TO service_role USING (true);
CREATE POLICY "push_subs_service_delete" ON push_subscriptions
  FOR DELETE TO service_role USING (true);
