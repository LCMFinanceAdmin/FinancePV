-- Extend gm_claims to support Purchase Orders and fixed asset tracking
-- Also adds claimant_type for Pastors, Lay Leaders, EXCO Members, Staff

ALTER TABLE gm_claims
  ADD COLUMN IF NOT EXISTS claim_type      TEXT NOT NULL DEFAULT 'EXPENSE_CLAIM',
  ADD COLUMN IF NOT EXISTS claimant_type   TEXT,
  ADD COLUMN IF NOT EXISTS supplier_name   TEXT,
  ADD COLUMN IF NOT EXISTS supplier_address TEXT,
  ADD COLUMN IF NOT EXISTS po_number       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS line_items      JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS is_fixed_asset  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asset_description TEXT;

-- Auto-generate PO number: PO-YYYY-NNN
CREATE OR REPLACE FUNCTION next_po_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr  TEXT := to_char(NOW(), 'YYYY');
  seq INT;
BEGIN
  SELECT COALESCE(MAX(CAST(split_part(po_number, '-', 3) AS INT)), 0) + 1
    INTO seq
    FROM gm_claims
    WHERE po_number LIKE 'PO-' || yr || '-%';
  RETURN 'PO-' || yr || '-' || LPAD(seq::TEXT, 3, '0');
END;
$$;
