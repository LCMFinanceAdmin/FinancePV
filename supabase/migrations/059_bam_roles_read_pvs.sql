-- 059: Let the Building/Event Manager and BAM Committee read BAM PVs.
--
-- The pvs table's RLS only granted SELECT to Finance Admin / senior roles (008)
-- plus each user's own rows, so the "My BAM PVs" page came back empty for the
-- Building/Event Manager — even for PVs he submitted himself — and the BAM
-- Committee couldn't see what they're meant to verify. Approval *writes* all go
-- through edge functions using the service client (which bypasses RLS), so a
-- SELECT policy scoped to pv_type = 'BAM' is all that's needed here.

DO $$
BEGIN
  ALTER TABLE IF EXISTS pvs ENABLE ROW LEVEL SECURITY;

  DROP POLICY IF EXISTS "pvs_bam_roles_read" ON pvs;
  CREATE POLICY "pvs_bam_roles_read" ON pvs
    FOR SELECT
    TO authenticated
    USING (
      pv_type = 'BAM'
      AND EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_roles.email = auth.jwt() ->> 'email'
          AND user_roles.role IN ('BUILDING_MANAGER', 'BAM_COMMITTEE')
      )
    );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pvs BAM read policy: %', SQLERRM;
END $$;
