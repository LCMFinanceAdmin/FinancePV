-- 171: give the Education seat the ministry it is a seat for.
--
-- 170 put Reena on education@lcm.org.my as EXCO_EDUCATION. The role alone does
-- not reach the budget. `user_roles.ministries` does, and hers is empty — the
-- "role over an empty queue" the Offices page warns about when it says that
-- whatever grants a portfolio has to say which ministry.
--
-- What empty means in each layer, which is why this looks like access and is
-- not:
--
--   nav       lib/user-profile.ts sets isMinistryHead from
--             `isExcoRole(role) || ministries.length > 0`. The role alone makes
--             it true, so Budget and the ministry queue appear in her menu.
--   page      app/(app)/budget/page.tsx builds its ministry list from
--             `ministries` unless the caller is Finance or senior. Hers is [],
--             so the page renders "No Ministry Assigned — contact a Finance
--             Executive to be assigned".
--   RLS       budget_items, budget_proposals and budget_change_requests all
--             write under `can_write_money() OR holds_ministry(ministry)`, and
--             holds_ministry() reads that same empty array. Reads are open to
--             anyone who is not a guest, so she would see Education's numbers
--             and every save would fail — silently, because a policy refusal
--             returns no error.
--   vouchers  mayVerifyFor() in supabase/functions/_shared/verifiers.ts asks
--             expandMinistries(ministries). Empty expands to empty, so she
--             could not verify an Education PV or payment request either.
--
-- Every other portfolio holder carries the name: Mission, Stewardship, Social
-- Concern, Orang Asli, SWF. This gives Education the same, and takes the name
-- from the office she actually holds rather than from a string typed here, so
-- it cannot drift from the register.
--
-- 'Education' is the right value and the only one needed. Everything booked to
-- this portfolio uses exactly that spelling — one budget item, one change
-- request, one PV, no variants. The sub-committee "Education Desk" is linked to
-- it in ministries.ts, which is what lets the Education Desk representative
-- verify what Education books and vice versa, but that expansion lives in the
-- edge functions; holds_ministry() matches the array literally. Nothing is
-- booked to "Education Desk" today, so nothing turns on it — if that changes,
-- the name has to be added here too.
--
-- Scope, said plainly: this is the portfolio right over Education and nothing
-- wider. It does not touch can_write_money(), so she gets no reach into any
-- other ministry's budget and no finance powers. Within Education she may raise
-- and edit a proposal, add and change its lines while it is DRAFT or REJECTED,
-- raise change requests, and verify Education spending. That is the whole of
-- what a portfolio holder has.

BEGIN;

-- The account, the role and the office, taken together. The ministry name is
-- read from the office the register says she holds, and then checked, so this
-- can only ever write the portfolio that her own open term grants.
CREATE TEMP TABLE portfolio ON COMMIT DROP AS
SELECT ur.email        AS login,
       o.name          AS ministry,
       p.full_name     AS person
  FROM user_roles ur
  JOIN people p          ON lower(p.user_email) = lower(ur.email)
  JOIN office_holdings h ON h.person_id = p.id AND h.term_end IS NULL
  JOIN offices o         ON o.id = h.office_id
                        AND o.grants_role = ur.role
                        AND o.active
 WHERE lower(ur.email) = 'education@lcm.org.my'
   AND ur.role = 'EXCO_EDUCATION'
   AND o.name = 'Education';

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM portfolio;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 Education seat to fill, found %. Either the account is no longer EXCO_EDUCATION, or the open Education term has moved — check the register before forcing this.', n;
  END IF;
END $$;

-- Add it rather than replace the array: if anything else has been assigned
-- since, it stays, and running this twice changes nothing.
UPDATE user_roles ur SET
  ministries = ARRAY(SELECT DISTINCT x
                       FROM unnest(COALESCE(ur.ministries, '{}') || ARRAY[pf.ministry]) x
                      WHERE btrim(x) <> ''),
  updated_at = NOW()
  FROM portfolio pf
 WHERE lower(ur.email) = lower(pf.login);

-- The one thing that has to be true afterwards: holds_ministry('Education')
-- matches on a trimmed, lower-cased comparison, so assert the array the same
-- way the policy will read it.
DO $$
DECLARE ok BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE lower(ur.email) = 'education@lcm.org.my'
       AND 'education' = ANY (SELECT lower(btrim(x)) FROM unnest(ur.ministries) x)
  ) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'Education is still not on the account. Nothing has been changed.';
  END IF;
END $$;

-- What this leaves: the seat, the portfolio on it, and what it now reaches.
SELECT ur.email, ur.full_name, ur.role, ur.ministries,
       (SELECT count(*) FROM budget_proposals      b WHERE b.ministry = 'Education') AS proposals,
       (SELECT count(*) FROM budget_items          b WHERE b.ministry = 'Education') AS items,
       (SELECT count(*) FROM budget_change_requests b WHERE b.ministry = 'Education') AS change_requests
  FROM user_roles ur
 WHERE lower(ur.email) = 'education@lcm.org.my';

COMMIT;
