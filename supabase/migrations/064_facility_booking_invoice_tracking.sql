-- 064: Track when an invoice was actually shared with the bookee, and any
-- void event, so the BEM can tell whether a customer already holds a copy
-- before making further changes.

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS invoice_sent_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_sent_via  TEXT,   -- 'EMAIL' | 'WHATSAPP'
  ADD COLUMN IF NOT EXISTS invoice_voided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_voided_by TEXT;
