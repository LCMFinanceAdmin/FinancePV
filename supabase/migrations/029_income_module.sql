-- 029: Income & Collections — facility bookings + income records

CREATE TABLE facility_bookings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_no    TEXT UNIQUE NOT NULL,            -- BK-2026-001

  -- Booker
  booker_name   TEXT NOT NULL DEFAULT '',
  booker_email  TEXT NOT NULL DEFAULT '',
  booker_phone  TEXT NOT NULL DEFAULT '',
  booker_org    TEXT NOT NULL DEFAULT '',
  booker_type   TEXT NOT NULL DEFAULT 'PUBLIC',  -- PUBLIC | MEMBER | CONGREGATION | HQ

  -- Event
  event_name    TEXT NOT NULL DEFAULT '',
  start_date    DATE NOT NULL,
  start_time    TEXT NOT NULL DEFAULT '',
  end_date      DATE,
  end_time      TEXT NOT NULL DEFAULT '',

  -- Line items (JSONB array)
  -- [{facility_id, facility_name, rate_label, sessions, rate_per_session, is_concurrent, subtotal}]
  booking_items JSONB NOT NULL DEFAULT '[]',
  total_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,

  -- Workflow
  status        TEXT NOT NULL DEFAULT 'ENQUIRY',  -- ENQUIRY | CONFIRMED | INVOICED | PAID | CANCELLED

  -- Payment (filled when PAID)
  payment_method TEXT NOT NULL DEFAULT '',
  payment_ref    TEXT NOT NULL DEFAULT '',
  payment_date   DATE,
  receipt_no     TEXT NOT NULL DEFAULT '',         -- OR-2026-001

  -- Notes
  purpose        TEXT NOT NULL DEFAULT '',
  notes          TEXT NOT NULL DEFAULT '',
  internal_notes TEXT NOT NULL DEFAULT '',

  created_by    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fb_status     ON facility_bookings(status);
CREATE INDEX idx_fb_start_date ON facility_bookings(start_date);
CREATE INDEX idx_fb_created_by ON facility_bookings(created_by);

CREATE TABLE income_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  record_no      TEXT UNIQUE NOT NULL,           -- OR-2026-001
  income_type    TEXT NOT NULL DEFAULT 'OTHER',  -- ELECTRICITY | DONATION | OTHER

  payer_name     TEXT NOT NULL DEFAULT '',
  payer_org      TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  amount         DECIMAL(12,2) NOT NULL DEFAULT 0,

  payment_date   DATE NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'CASH',   -- CASH | BANK_TRANSFER | CHEQUE | ONLINE
  payment_ref    TEXT NOT NULL DEFAULT '',

  period_covered TEXT NOT NULL DEFAULT '',       -- "June 2026" for electricity

  notes          TEXT NOT NULL DEFAULT '',
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ir_income_type  ON income_records(income_type);
CREATE INDEX idx_ir_payment_date ON income_records(payment_date);

-- Next booking number (BK-YYYY-NNN)
CREATE OR REPLACE FUNCTION next_booking_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr     TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix TEXT := 'BK-' || yr || '-';
  last   INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(booking_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM facility_bookings WHERE booking_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

-- Next official receipt number (OR-YYYY-NNN) across both tables
CREATE OR REPLACE FUNCTION next_receipt_no()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  yr      TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix  TEXT := 'OR-' || yr || '-';
  last_bk INT;
  last_ir INT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last_bk FROM facility_bookings WHERE receipt_no LIKE prefix || '%';
  SELECT COALESCE(MAX(CAST(SUBSTRING(record_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last_ir FROM income_records WHERE record_no LIKE prefix || '%';
  RETURN prefix || LPAD((GREATEST(last_bk, last_ir) + 1)::TEXT, 3, '0');
END;
$$;

-- RLS
ALTER TABLE facility_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fb_select" ON facility_bookings FOR SELECT TO authenticated USING (true);
CREATE POLICY "fb_insert" ON facility_bookings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "fb_update" ON facility_bookings FOR UPDATE TO authenticated USING (true);

ALTER TABLE income_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ir_select" ON income_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "ir_insert" ON income_records FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ir_update" ON income_records FOR UPDATE TO authenticated USING (true);
