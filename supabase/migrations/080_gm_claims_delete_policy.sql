-- 080: Allow deleting GM claims.
-- gm_claims had SELECT / INSERT / UPDATE policies but no DELETE policy. With
-- RLS enabled, a missing DELETE policy silently blocks every delete (0 rows
-- affected, no error) — which is why deleted claims reappeared on refresh.

DROP POLICY IF EXISTS "gm_claims_delete" ON gm_claims;
CREATE POLICY "gm_claims_delete" ON gm_claims FOR DELETE TO authenticated USING (true);
