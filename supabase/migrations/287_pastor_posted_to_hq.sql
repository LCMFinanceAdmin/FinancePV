-- A pastor posted to the office is office staff, for leave.
--
-- Chan Mun Kwan is a retired pastor working at HQ on contract, under the
-- Education Desk. The directory says so in three fields -- category PASTOR,
-- ministry_status RETIRED_CONTRACT, posting HQ -- and has since his record was
-- made. The leave routing never asked: it reads user_roles.is_pastor, a plain
-- boolean meaning "is ordained", and sent him down the congregational chain
-- looking for a Pastor in Charge and a Dean he does not have. Finding neither,
-- it fell back to the Bishop alone, which is the right answer arrived at by the
-- wrong route and for the wrong reason -- and which 286 was about to report as
-- a fault in his record.
--
-- It is not a fault in his record. His record is complete and correct. The
-- fault was a question with two meanings: settings/directory already says of
-- the same pair of fields that "the two were both claiming to answer 'is this
-- person a pastor' and had already diverged".
--
-- So the routing asks the directory the question the directory answers.
-- Through a definer, because people is not readable by the person whose leave
-- is being routed -- an EXCO member reading it gets nothing back, and a silent
-- nothing would move every pastor onto the office chain at once.
--
-- Four more pastors are posted to HQ and none of them serves a congregation.
-- None has an account yet; when they get one it will route correctly without
-- anybody remembering to untick a box, which is the point of asking the
-- directory rather than keeping a second copy of the answer.

BEGIN;

-- NULL means the directory does not say. The caller keeps its present
-- behaviour in that case, so this can only move somebody OFF the pastoral
-- chain and only when the directory positively says they are at HQ. A rule
-- that can reclassify everybody the moment a join misses is not one to put
-- under leave.
CREATE OR REPLACE FUNCTION public.serves_a_congregation(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
           -- Retired is retired however they are posted, and a retiree on
           -- contract at the office is the case this was written for.
           WHEN p.ministry_status LIKE 'RETIRED%' THEN false
           WHEN p.posting = 'HQ'          THEN false
           WHEN p.posting = 'CONGREGATION' THEN true
           ELSE NULL
         END
    FROM people p
   WHERE p.status = 'ACTIVE'
     AND (lower(COALESCE(p.user_email, '')) = lower(p_email)
       OR lower(COALESCE(p.work_email, '')) = lower(p_email))
   LIMIT 1;
$$;

COMMENT ON FUNCTION public.serves_a_congregation(TEXT) IS
  'Whether this person''s leave should climb the congregational chain -- '
  'Pastor in Charge, then Dean -- or the office chain to the General Manager. '
  'NULL where the directory does not say, and the caller then falls back to '
  'user_roles.is_pastor. Returns no personal detail: one boolean.';

-- Postgres grants EXECUTE to PUBLIC on a new function and Supabase's anon role
-- inherits PUBLIC -- migration 212 shipped two privileged functions that way.
-- This one answers a question about a named person, so it is not for anybody
-- without an account.
REVOKE EXECUTE ON FUNCTION public.serves_a_congregation(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.serves_a_congregation(TEXT) TO authenticated, service_role;

-- 286 recorded a gap against nothing, because no pastoral application has been
-- filed yet. Were there one from somebody now routed as office staff, the
-- stored reason would describe a chain that is no longer theirs.
UPDATE leave_applications l
   SET routing_gap = NULL
 WHERE l.routing_gap = 'NO_CONGREGATION'
   AND serves_a_congregation(l.applicant_email) IS FALSE;

COMMIT;
