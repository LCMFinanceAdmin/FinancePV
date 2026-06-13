-- 016: Back-fill "Finance Executive" into historical PV records and notifications
-- Replaces the old seeded placeholder name "Finance Admin" wherever it was
-- stored as the verifier name or inside the approvals JSONB array.
-- Internal role codes (FINANCE_ADMIN etc.) are left untouched.

-- ── pvs.finance_verified_by ────────────────────────────────────────────────
UPDATE pvs SET finance_verified_by = 'Finance Executive 3'
  WHERE finance_verified_by = 'Finance Admin 3';

UPDATE pvs SET finance_verified_by = 'Accounts Executive'
  WHERE finance_verified_by = 'Finance Admin 2';

UPDATE pvs SET finance_verified_by = 'Finance Executive'
  WHERE finance_verified_by = 'Finance Admin';

-- ── pvs.approvals JSONB array — rename the "name" field of each entry ──────
UPDATE pvs
SET approvals = (
  SELECT jsonb_agg(
    CASE
      WHEN (elem->>'name') = 'Finance Admin 3'
        THEN jsonb_set(elem, '{name}', '"Finance Executive 3"')
      WHEN (elem->>'name') = 'Finance Admin 2'
        THEN jsonb_set(elem, '{name}', '"Accounts Executive"')
      WHEN (elem->>'name') = 'Finance Admin'
        THEN jsonb_set(elem, '{name}', '"Finance Executive"')
      ELSE elem
    END
  )
  FROM jsonb_array_elements(approvals) AS elem
)
WHERE approvals IS NOT NULL
  AND (
    approvals::text ILIKE '%"Finance Admin 3"%'
    OR approvals::text ILIKE '%"Finance Admin 2"%'
    OR approvals::text ILIKE '%"Finance Admin"%'
  );

-- ── notifications ──────────────────────────────────────────────────────────
-- Replace longer variants first to avoid double-replacement
UPDATE notifications
  SET message = REPLACE(message, 'Finance Admin 3', 'Finance Executive 3')
  WHERE message ILIKE '%Finance Admin 3%';

UPDATE notifications
  SET message = REPLACE(message, 'Finance Admin 2', 'Accounts Executive')
  WHERE message ILIKE '%Finance Admin 2%';

UPDATE notifications
  SET message = REPLACE(message, 'Finance Admin', 'Finance Executive')
  WHERE message ILIKE '%Finance Admin%';
