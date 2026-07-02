-- 066: Let any authenticated user read their own submitted PVs.
--
-- The pvs table's existing SELECT policies only cover Finance Admin / senior
-- roles (008) and BAM roles (059). Regular Staff / HOD / EXCO / Member users
-- who submit PVs through the "Submit PV" form had no policy that returned
-- their own rows, so My PVs and the Dashboard showed an empty list even
-- though the PV was successfully created.

ALTER TABLE pvs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pvs_submitter_read" ON pvs;

CREATE POLICY "pvs_submitter_read" ON pvs
  FOR SELECT
  TO authenticated
  USING (submitted_by_email = (auth.jwt() ->> 'email'));
