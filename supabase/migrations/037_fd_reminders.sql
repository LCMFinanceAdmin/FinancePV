-- FD Maturity Reminder: notify Finance Admin 7 days before maturity
-- Runs daily at 08:00 Malaysia time (00:00 UTC)

CREATE OR REPLACE FUNCTION fn_fd_maturity_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cert   RECORD;
  v_admin  RECORD;
  v_label  TEXT;
  v_days   INT;
  v_amt    NUMERIC;
BEGIN
  FOR v_cert IN
    SELECT
      c.id,
      c.certificate_no,
      c.new_certificate_no,
      c.maturity_date,
      c.principal,
      c.new_principal,
      ba.name        AS account_name,
      ba.bank_name,
      (c.maturity_date - CURRENT_DATE)::INT AS days_left
    FROM fd_certificates c
    JOIN bank_accounts ba ON ba.id = c.account_id
    WHERE c.status = 'ACTIVE'
      AND c.maturity_date BETWEEN CURRENT_DATE + 1 AND CURRENT_DATE + 7
      -- Skip if a reminder was already sent today for this cert
      AND NOT EXISTS (
        SELECT 1 FROM notifications
        WHERE type = 'fd_maturity'
          AND message ILIKE '%' || c.certificate_no || '%'
          AND created_at > NOW() - INTERVAL '20 hours'
      )
  LOOP
    v_label := COALESCE(v_cert.new_certificate_no, v_cert.certificate_no);
    v_amt   := COALESCE(v_cert.new_principal,      v_cert.principal);
    v_days  := v_cert.days_left;

    FOR v_admin IN
      SELECT email FROM profiles
      WHERE role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2')
    LOOP
      INSERT INTO notifications
        (user_email, title, message, type, link, read, created_at)
      VALUES (
        v_admin.email,
        'FD Maturity in ' || v_days || ' day' || CASE WHEN v_days = 1 THEN '' ELSE 's' END
          || ' — ' || v_cert.bank_name,
        v_cert.account_name
          || ' | Cert ' || v_label
          || ' matures ' || TO_CHAR(v_cert.maturity_date, 'DD Mon YYYY')
          || ' | Principal RM ' || TO_CHAR(v_amt, 'FM999,999,990.00')
          || '. Please arrange renewal with the bank.',
        'fd_maturity',
        '/banking',
        false,
        NOW()
      );
    END LOOP;
  END LOOP;
END;
$$;

-- Schedule: every day at 08:00 Malaysia time (UTC+8 = 00:00 UTC)
-- Requires pg_cron extension (enabled by default on Supabase)
SELECT cron.schedule(
  'fd-maturity-check',       -- job name
  '0 0 * * *',               -- daily at 00:00 UTC (08:00 MYT)
  'SELECT fn_fd_maturity_reminders()'
);
