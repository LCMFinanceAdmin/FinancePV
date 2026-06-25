-- 063: public_booked_ranges was treating a facility as booked across the
-- booking's ENTIRE start_date..end_date span. Now that a booking can have a
-- facility on non-contiguous dates (e.g. Word Auditorium on the 25th and the
-- 30th only), that over-blocked every day in between for that facility on
-- the public calendar. Use each line item's own dates[] when present,
-- falling back to the booking's range for older rows that predate it.

CREATE OR REPLACE FUNCTION public_booked_ranges()
RETURNS TABLE(facility_id TEXT, start_date DATE, end_date DATE)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (item->>'facility_id')::TEXT,
    COALESCE((d #>> '{}')::DATE, b.start_date) AS start_date,
    COALESCE((d #>> '{}')::DATE, b.end_date, b.start_date) AS end_date
  FROM facility_bookings b
  CROSS JOIN LATERAL jsonb_array_elements(b.booking_items) AS item
  LEFT JOIN LATERAL jsonb_array_elements(item->'dates') AS d ON true
  WHERE b.status IN ('CONFIRMED', 'INVOICED', 'PAID')
    AND b.start_date IS NOT NULL;
$$;
GRANT EXECUTE ON FUNCTION public_booked_ranges() TO anon, authenticated;
