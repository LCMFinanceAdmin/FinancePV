-- 061: classify facility bookings by event type. Weddings require an
-- endorsement letter (signed by the pastor-in-charge, chopped by church
-- administration); other event types don't, so the BEM can proceed without
-- one, with the requirement flagged instead of blocking the booking.

ALTER TABLE facility_bookings ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'OTHER';
