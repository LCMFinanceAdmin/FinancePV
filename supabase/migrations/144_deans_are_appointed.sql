-- 144: Dean's posts are appointments, not elections.
--
-- The posts were created by the district trigger, which sets is_elected TRUE
-- because the DEAN category was written as "one elected Dean per district".
-- They are appointed, so the register was offering "Elect" and expecting a
-- term where neither applies.
--
-- PERMANENT means held until somebody replaces them, which is what the
-- register needs in order to offer "Appoint" and "Replace" rather than
-- "Elect", and to stop asking for a term length. If the constitution does set
-- a term for Deans, giving the post one in the form switches it back — the
-- trigger that keeps is_elected and tenure in step handles both directions.

UPDATE offices
   SET tenure = 'PERMANENT'
 WHERE kind = 'DEAN';

UPDATE office_categories
   SET description = 'One Dean per district, appointed — leave routing follows this'
 WHERE key = 'DEAN';
