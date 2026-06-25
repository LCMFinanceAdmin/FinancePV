-- 062: Dual e-signature before a facility booking is confirmed — the bookee
-- signs to acknowledge the booking/rates, and the BEM signs to verify and
-- approve, before the booking (and its invoice) can be confirmed.

ALTER TABLE facility_bookings
  ADD COLUMN IF NOT EXISTS booker_signature TEXT,
  ADD COLUMN IF NOT EXISTS booker_signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bem_signature    TEXT,
  ADD COLUMN IF NOT EXISTS bem_signed_by    TEXT,
  ADD COLUMN IF NOT EXISTS bem_signed_at    TIMESTAMPTZ;
