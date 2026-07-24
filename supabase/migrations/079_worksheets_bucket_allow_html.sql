-- The signed worksheet attached to a PV is now generated as an HTML file
-- (see worksheets/page.tsx generatePV() and submit/page.tsx) instead of a
-- react-pdf PDF — react-pdf's image layout proved unreliable for the
-- signature area, whereas plain HTML with an <img> renders it correctly in
-- every browser. The "worksheets" bucket was created (migration 058) with
-- allowed_mime_types locked to application/pdf only, so every upload of the
-- new .html file has been silently rejected by Supabase Storage since that
-- change shipped — this is what surfaced as a 400 fetching the (never
-- actually created) .html object, and "can't generate PV" for the user.
UPDATE storage.buckets
SET allowed_mime_types = ARRAY['application/pdf', 'text/html']
WHERE id = 'worksheets';
