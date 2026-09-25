-- 233: the post the applicant held when they applied.
--
-- The printed leave form has a Position row and has always printed it empty.
-- The template reads `designation`, the table has no such column, and neither
-- of the two screens that open the form passes one — so every leave form ever
-- printed or filed has a blank where the applicant's post should be. Note 6 on
-- the form says the signed copy is filed in the Personal Record File, which is
-- exactly the document where that blank matters.
--
-- Stored rather than looked up, for the same reason an approval stores the
-- office it was given under: the form should read as it did when it was
-- signed. Somebody who was Accounts Executive in 2026 does not retrospectively
-- become whatever they are promoted to in 2028 on a form they signed once.

ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS designation TEXT;

COMMENT ON COLUMN leave_applications.designation IS
  'The applicant''s post as it stood when they applied — their recorded '
  'designation, or the label of their role where none is recorded. Frozen at '
  'submission so a filed form keeps reading correctly.';

-- Existing applications get the post their applicant holds now. Not what they
-- held at the time, which nothing recorded, but far better than the blank that
-- is there today and honest about where it came from.
UPDATE leave_applications la
   SET designation = COALESCE(NULLIF(TRIM(u.designation), ''), '')
  FROM user_roles u
 WHERE lower(u.email) = lower(la.applicant_email)
   AND la.designation IS NULL
   AND COALESCE(NULLIF(TRIM(u.designation), ''), '') <> '';
