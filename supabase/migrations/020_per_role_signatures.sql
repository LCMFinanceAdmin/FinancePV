-- 020: per-role saved signatures
-- Replace the single saved_signature TEXT with a JSONB map keyed by role,
-- so Finance Executive, GM, and each Signatory each store their own signature.
ALTER TABLE user_roles ADD COLUMN IF NOT EXISTS saved_signatures JSONB DEFAULT '{}';

-- Back-fill: migrate existing saved_signature into the map under the user's current role
UPDATE user_roles
SET saved_signatures = jsonb_build_object(role, saved_signature)
WHERE saved_signature IS NOT NULL AND saved_signature <> '';
