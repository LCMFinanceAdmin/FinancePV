-- 163: whose name a bank account is actually in.
--
-- bank_accounts.entity says which body's money an account holds. It does not
-- say which body the account is registered to, and for Lutheran Garden those
-- are different: the Hong Leong account is LCM's, kept for LGB matters. The
-- only record of that was the wording of the account's name — "LCM (Lutheran
-- Garden Berhad) Account (Hong Leong)" — which no query can read.
--
-- Highlands Lakeview is the opposite case and the reason this matters: a
-- separate company, its own account, its own statement. Filing the two the same
-- way would tell whoever reconciles them that LGB has a bank relationship it
-- does not have, and would hide that HLE's money sits outside the church's
-- own accounts entirely.
ALTER TABLE bank_accounts ADD COLUMN IF NOT EXISTS registered_to TEXT;

COMMENT ON COLUMN bank_accounts.registered_to IS
  'The body the account is legally registered to, where that differs from the body whose money it holds. Null means the account is in the holding body''s own name.';

-- Everything already on file is in its own name, except the one that is not.
UPDATE bank_accounts
   SET registered_to = 'LCM'
 WHERE entity = 'LUTHERAN_GARDEN' AND registered_to IS NULL;

-- ── Carried through to the paid archive ───────────────────────────────────
DROP FUNCTION IF EXISTS paid_pv_entity_months();
CREATE FUNCTION paid_pv_entity_months()
RETURNS TABLE(entity TEXT, bank_name TEXT, registered_to TEXT, month DATE, pv_count BIGINT, total NUMERIC)
LANGUAGE sql STABLE
AS $$
  WITH acct AS (
    SELECT
      COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM') AS body,
      (SELECT b.bank_name FROM bank_accounts b
        WHERE b.is_active AND b.account_type IS DISTINCT FROM 'FIXED_DEPOSIT'
          AND (b.entity = COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM')
            OR (COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM') = 'LSC' AND b.entity = 'STUDY_CENTRE')
            OR (COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM') = 'LGB' AND b.entity = 'LUTHERAN_GARDEN'))
        ORDER BY
          (b.name ILIKE '%disburse%' OR b.purpose ILIKE '%disburse%') DESC,
          (b.name ILIKE '%collection%' OR b.purpose ILIKE '%collection%') ASC,
          b.sort_order, b.name
        LIMIT 1) AS bank_name,
      (SELECT b.registered_to FROM bank_accounts b
        WHERE b.is_active AND b.account_type IS DISTINCT FROM 'FIXED_DEPOSIT'
          AND (b.entity = COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM')
            OR (COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM') = 'LSC' AND b.entity = 'STUDY_CENTRE')
            OR (COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM') = 'LGB' AND b.entity = 'LUTHERAN_GARDEN'))
        ORDER BY
          (b.name ILIKE '%disburse%' OR b.purpose ILIKE '%disburse%') DESC,
          (b.name ILIKE '%collection%' OR b.purpose ILIKE '%collection%') ASC,
          b.sort_order, b.name
        LIMIT 1) AS registered_to,
      DATE_TRUNC('month', p.paid_at)::DATE AS month,
      p.amount
    FROM pvs p
    WHERE p.status = 'PAID' AND p.paid_at IS NOT NULL
  )
  SELECT body, bank_name, registered_to, month,
         COUNT(*)::BIGINT, COALESCE(SUM(amount), 0)
  FROM acct
  GROUP BY body, bank_name, registered_to, month
  ORDER BY body, month DESC;
$$;

REVOKE ALL ON FUNCTION paid_pv_entity_months() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION paid_pv_entity_months() TO authenticated;
