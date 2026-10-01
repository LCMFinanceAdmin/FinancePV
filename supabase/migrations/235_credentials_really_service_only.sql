-- 235: make the credentials table as private as its policy already claims.
--
-- user_security_credentials holds eleven people's approval PIN hashes and
-- their saved signature images. Its only policy is named
-- security_credentials_service_only — and is USING (true) WITH CHECK (true),
-- which applies to every role, not to the service role alone. So any signed-in
-- account, guests included, could read every PIN hash and every stored
-- signature, and overwrite them.
--
-- The signatures are the worse half. A PIN hash still has to be reversed; a
-- signature image is already the thing that goes on a voucher.
--
-- Nothing in the browser touches this table. Every read and write comes from
-- an edge function, which uses the service role and bypasses RLS entirely — so
-- a policy for clients was never needed, and dropping it costs nothing. RLS is
-- enabled and will now deny by default, which is what "service only" means.
--
-- Left as a policy-free table rather than given a narrow self-access rule:
-- nothing asks for one, and a policy that exists only in case somebody wants
-- it later is how the last one came to say something it did not mean.

DROP POLICY IF EXISTS security_credentials_service_only ON user_security_credentials;

-- Belt and braces: the table-level grants are what a policy filters. With no
-- policy there is nothing to filter, but revoking makes the intent explicit to
-- anyone reading the schema rather than the migration.
REVOKE ALL ON user_security_credentials FROM anon, authenticated;

COMMENT ON TABLE user_security_credentials IS
  'Approval PIN hashes and saved signature images. Service role only — reached '
  'through edge functions, never from the browser. RLS is enabled with no '
  'policy, so clients get nothing.';
