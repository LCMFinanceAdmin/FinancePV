-- 053: Public facility-booking form support.
-- Lets unauthenticated visitors submit a booking ENQUIRY and see which dates are
-- already taken (per facility) — without exposing any booker details.

-- Allow anon to insert, but only as an ENQUIRY (BEM reviews before confirming).
GRANT INSERT ON facility_bookings TO anon;

DROP POLICY IF EXISTS "fb_insert_anon" ON facility_bookings;
CREATE POLICY "fb_insert_anon" ON facility_bookings
  FOR INSERT TO anon
  WITH CHECK (status = 'ENQUIRY');

-- Booking number generator: SECURITY DEFINER so anon can call it without
-- read access to the table.
CREATE OR REPLACE FUNCTION next_booking_no()
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
GRANT EXECUTE ON FUNCTION next_booking_no() TO anon;

-- Booked date ranges per facility, for blocking statuses only. No booker PII.
CREATE OR REPLACE FUNCTION public_booked_ranges()
RETURNS TABLE(facility_id TEXT, start_date DATE, end_date DATE)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT (item->>'facility_id')::TEXT, b.start_date, COALESCE(b.end_date, b.start_date)
  FROM facility_bookings b
  CROSS JOIN LATERAL jsonb_array_elements(b.booking_items) AS item
  WHERE b.status IN ('CONFIRMED', 'INVOICED', 'PAID')
    AND b.start_date IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public_booked_ranges() TO anon, authenticated;
