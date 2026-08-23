-- 162: paid vouchers grouped by the body that paid them.
--
-- The paid archive lists months. Accounts works the other way round — its
-- question is "what did BAM's Maybank account pay in August", not "what did the
-- church pay in August" — because each body reconciles against its own bank
-- statement. One archive answering only the first question meant opening every
-- month and reading past four bodies to find one.
--
-- The body is pvs.pv_type, which is also what the voucher number is prefixed
-- with: LCM-2026-003 is paid by LCM, BAM-2026-003 by BAM. The bank is not on the
-- voucher — payer_bank_name is empty on every paid row — so it is looked up from
-- bank_accounts, which already records one disbursement account per entity.
-- That mapping lives here rather than in the page so both the count and the
-- label come from the same place.

-- Which account each body disburses from, for labelling "LCM · Public Bank".
-- A fixed deposit is not a disbursement account, so it is excluded; where a body
-- has several the lowest sort_order wins, which is the order Banking already
-- presents them in.
CREATE OR REPLACE FUNCTION entity_disbursement_bank(p_entity TEXT)
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  SELECT b.bank_name
    FROM bank_accounts b
   WHERE b.is_active
     AND b.account_type IS DISTINCT FROM 'FIXED_DEPOSIT'
     AND (b.entity = p_entity
          -- The two bodies whose bank_accounts.entity does not match the
          -- voucher prefix. Named rather than guessed at by pattern.
          OR (p_entity = 'LSC' AND b.entity = 'STUDY_CENTRE')
          OR (p_entity = 'LGB' AND b.entity = 'LUTHERAN_GARDEN'))
   ORDER BY
     (b.name ILIKE '%disburse%' OR b.purpose ILIKE '%disburse%') DESC,
     (b.name ILIKE '%collection%' OR b.purpose ILIKE '%collection%') ASC,
     b.sort_order, b.name
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION entity_disbursement_bank(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION entity_disbursement_bank(TEXT) TO authenticated;

-- One row per body per month, so the tree can be drawn and totalled without
-- fetching a single voucher — the same shape paid_pv_months() returns, with the
-- body added.
CREATE OR REPLACE FUNCTION paid_pv_entity_months()
RETURNS TABLE(entity TEXT, bank_name TEXT, month DATE, pv_count BIGINT, total NUMERIC)
LANGUAGE sql STABLE
AS $$
  SELECT
    COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM')            AS entity,
    entity_disbursement_bank(COALESCE(NULLIF(btrim(p.pv_type), ''), 'LCM')) AS bank_name,
    DATE_TRUNC('month', p.paid_at)::DATE                     AS month,
    COUNT(*)                                                 AS pv_count,
    COALESCE(SUM(p.amount), 0)                               AS total
  FROM pvs p
  WHERE p.status = 'PAID' AND p.paid_at IS NOT NULL
  GROUP BY 1, 2, 3
  ORDER BY 1, 3 DESC;
$$;

REVOKE ALL ON FUNCTION paid_pv_entity_months() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION paid_pv_entity_months() TO authenticated;
