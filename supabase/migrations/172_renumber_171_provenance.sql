-- 172: point the merge notes at the number the migration actually carries.
--
-- 171 was written as 169 and ran under that number, stamping two person_notes
-- rows with author_name 'migration 169' and a body saying the merge was done
-- "by migration 169". The file was renumbered on merge, because 169 had been
-- taken by the contact-sheet import while it was being written.
--
-- Nothing here changes what happened; it makes the note say the number the file
-- now carries, so somebody reading the note can find the migration it names.
-- Both statements are narrow enough to be safe if run twice.

BEGIN;

UPDATE person_notes
   SET body = replace(body, 'by migration 169.', 'by migration 171.'),
       author_name = 'migration 171',
       updated_at = NOW()
 WHERE author_name = 'migration 169';

SELECT count(*) FILTER (WHERE author_name = 'migration 171') AS now_171,
       count(*) FILTER (WHERE author_name = 'migration 169') AS still_169,
       count(*) FILTER (WHERE body ILIKE '%migration 169%') AS body_still_169
  FROM person_notes;

COMMIT;
