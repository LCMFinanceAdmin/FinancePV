-- 028: Add accounting_code and office_ref to pvs for Finance/Accounts Exec use
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS accounting_code TEXT DEFAULT '';
ALTER TABLE pvs ADD COLUMN IF NOT EXISTS office_ref TEXT DEFAULT '';
