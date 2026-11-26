-- A filed application remembers that its chain fell back.
--
-- 265's sibling in the leave module: leaveRouting now reports a gap when the
-- chain it produced is not the chain the rules describe, and the apply form
-- and the access panel both show it. Neither helps the five applications
-- already sitting in a queue, or any filed before somebody noticed -- the
-- warning is worked out when the form is open and then thrown away.
--
-- So it is kept. An approver looking at an application can see that the Pastor
-- in Charge and the Dean were skipped before they sign it, which is the last
-- point at which anybody is looking.
--
-- It records what was true at submission, like required_approvers, designation
-- and the two balances already on this table. A record of a decision is worth
-- less if it moves afterwards.

BEGIN;

ALTER TABLE leave_applications
  ADD COLUMN IF NOT EXISTS routing_gap TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_applications_routing_gap_known'
  ) THEN
    ALTER TABLE leave_applications
      ADD CONSTRAINT leave_applications_routing_gap_known
      CHECK (routing_gap IS NULL
             OR routing_gap IN ('NO_CONGREGATION', 'NOBODY_ABOVE', 'NO_APPROVER'));
  END IF;
END;
$$;

COMMENT ON COLUMN leave_applications.routing_gap IS
  'Why this application''s chain is not the one the rules describe, as at '
  'submission. Null means there was no gap, or the application was filed '
  'before this was recorded. Values match RoutingGap in lib/leave-approvers.ts.';

-- ---------------------------------------------------------------------------
-- What is already on record
-- ---------------------------------------------------------------------------
-- A pastoral chain that fell back is recognisable: the applicant is a pastor,
-- is not a Dean, has no congregation against their name, and the whole chain
-- is the Bishop on his own.
--
-- Each of those is load-bearing. A Dean's chain is the Bishop alone and that
-- is their rule, not a fallback. A member of office staff set to BISHOP_ONLY
-- has the same shape for a third reason. Marking either would put an amber
-- warning on a correct application, and a warning that is wrong twice is a
-- warning nobody reads the third time.
--
-- On today's ten applications this matches none of them -- all ten are office
-- staff on the General Manager's chain. It is written for the rows this would
-- have caught, and for anything filed between the code shipping and this
-- running.
UPDATE leave_applications l
   SET routing_gap = 'NO_CONGREGATION'
  FROM user_roles u
 WHERE l.routing_gap IS NULL
   AND lower(u.email) = lower(l.applicant_email)
   AND u.is_pastor
   AND u.congregation_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM districts d
                    WHERE lower(d.dean_email) = lower(u.email))
   AND jsonb_array_length(COALESCE(l.required_approvers, '[]'::jsonb)) = 1
   AND EXISTS (
     SELECT 1 FROM jsonb_array_elements(l.required_approvers) a
      JOIN user_roles b ON lower(b.email) = lower(a->>'email')
     WHERE b.role::text = 'BISHOP');

COMMIT;
