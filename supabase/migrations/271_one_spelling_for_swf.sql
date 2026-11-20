-- 271: one spelling for SWF, and this time the register is the one that moves.
--
-- 269 left this open deliberately. YAY was split the same way and 121 had
-- already recorded which spelling the church meant, so the pickers were brought
-- to the register. SWF is split the other way round — the register says "Sister
-- and Women Fellowship (SWF)" and the pickers say "Sisters" — and nothing on
-- record said which was the fellowship's own name. It is "Sisters and Women
-- Fellowship (SWF)". So the register moves.
--
-- Everything the old spelling touches, found by scanning every text, json and
-- array column in the schema rather than by remembering where names live:
--
--   ministries.name           the lookup row
--   offices.name              the EXCO post, kind EXCO, grants EXCO_SWF
--   user_roles.ministries     Linda Wong's portfolio, on swm@lcm.org.my
--   app_roles.label           "EXCO — Sister and Women Fellowship"
--   app_roles.description     "Verifies Sister and Women Fellowship (SWF)…"
--
-- And nothing else: no voucher, no budget line, no proposal, no change request
-- is booked to SWF under either spelling yet. That is luck rather than design,
-- so the corrections below are written for the data tables anyway — a row
-- raised between this being written and it being run must not be stranded.
--
-- ── Why both halves of the register move in one statement ─────────────────
-- 197 made an EXCO member's ministry follow the office they hold, and its
-- trigger finds the ministry by joining the two by name:
--
--     FROM offices o JOIN ministries m ON m.name = o.name
--
-- If only one of them were renamed that join would stop matching, and the
-- failure is silent: the function returns NULL and simply grants nothing, so
-- the next SWF holder would be seated with an empty portfolio and no error
-- anywhere. The two names are one fact and are changed together.
--
-- The same trigger is why Linda's array is corrected by replacement rather than
-- by adding the new name. It is additive and never subtractive by design, so an
-- append would leave her holding both spellings, and the budget page would show
-- her committee twice — one of them pointing at a ministry that no longer
-- exists. It fires on office_holdings, not on a rename, so nothing propagates
-- this for us either way.
--
-- No foreign key references ministries, checked rather than assumed, so the
-- rename cascades nowhere and breaks no reference.
--
-- After this, "Sister and Women Fellowship" appears nowhere in the database.
-- It survives in the comments of 197 and 269, which is where it belongs: both
-- were accurate when written, and a migration that edits the history of what
-- the register used to say is worth less than one that records why it changed.

BEGIN;

-- Refuse if the destination name is already taken, which would mean somebody
-- has added a second SWF row and this is no longer a rename but a merge.
DO $$
DECLARE n INT;
BEGIN
  SELECT (SELECT count(*) FROM ministries WHERE name = 'Sisters and Women Fellowship (SWF)')
       + (SELECT count(*) FROM offices    WHERE name = 'Sisters and Women Fellowship (SWF)')
    INTO n;
  IF n <> 0 THEN
    RAISE EXCEPTION 'A register entry already uses the new spelling (% found). This would be a merge, not a rename — look before forcing it.', n;
  END IF;
END $$;

-- 1. The register, both halves, so 197's join keeps matching.
UPDATE ministries SET name = 'Sisters and Women Fellowship (SWF)'
 WHERE name = 'Sister and Women Fellowship (SWF)';

UPDATE offices SET name = 'Sisters and Women Fellowship (SWF)'
 WHERE name = 'Sister and Women Fellowship (SWF)';

-- 2. The portfolio on the holder's account. Replace, never append: 197's
--    trigger only ever adds, so a holder carrying both spellings would never
--    shed the dead one.
UPDATE user_roles ur
   SET ministries = ARRAY(
         SELECT DISTINCT CASE WHEN x = 'Sister and Women Fellowship (SWF)'
                              THEN 'Sisters and Women Fellowship (SWF)' ELSE x END
           FROM unnest(ur.ministries) x),
       updated_at = NOW()
 WHERE 'Sister and Women Fellowship (SWF)' = ANY (COALESCE(ur.ministries, ARRAY[]::TEXT[]));

-- 3. What the role calls itself in every picker.
UPDATE app_roles
   SET label       = replace(label,       'Sister and Women', 'Sisters and Women'),
       description = replace(description, 'Sister and Women', 'Sisters and Women'),
       updated_at  = NOW()
 WHERE key = 'EXCO_SWF';

-- 4. Anything booked to the old name. All four are expected to be empty; they
--    are here so a row raised in the meantime is not stranded under a name the
--    register no longer holds.
UPDATE pvs                    SET ministry = 'Sisters and Women Fellowship (SWF)'
 WHERE btrim(ministry) = 'Sister and Women Fellowship (SWF)';
UPDATE budget_items           SET ministry = 'Sisters and Women Fellowship (SWF)'
 WHERE btrim(ministry) = 'Sister and Women Fellowship (SWF)';
UPDATE budget_proposals       SET ministry = 'Sisters and Women Fellowship (SWF)'
 WHERE btrim(ministry) = 'Sister and Women Fellowship (SWF)';
UPDATE budget_change_requests SET ministry = 'Sisters and Women Fellowship (SWF)'
 WHERE btrim(ministry) = 'Sister and Women Fellowship (SWF)';

-- 5. The invariant 197 depends on, asserted rather than hoped for: the EXCO
--    post and the ministry it covers are named the same thing.
DO $$
DECLARE joined INT; stale INT;
BEGIN
  SELECT count(*) INTO joined
    FROM offices o
    JOIN ministries m ON m.name = o.name
   WHERE o.grants_role = 'EXCO_SWF' AND o.kind IN ('EXCO', 'PROJECT');
  IF joined <> 1 THEN
    RAISE EXCEPTION 'The SWF post and the SWF ministry no longer share a name (% match). 197 would grant nothing. Nothing has been changed.', joined;
  END IF;

  SELECT (SELECT count(*) FROM ministries WHERE name LIKE '%Sister and Women%')
       + (SELECT count(*) FROM offices    WHERE name LIKE '%Sister and Women%')
       + (SELECT count(*) FROM app_roles  WHERE label LIKE '%Sister and Women%'
                                             OR description LIKE '%Sister and Women%')
       + (SELECT count(*) FROM user_roles
           WHERE array_to_string(COALESCE(ministries, ARRAY[]::TEXT[]), '|') LIKE '%Sister and Women%')
       + (SELECT count(*) FROM pvs                    WHERE ministry LIKE '%Sister and Women%')
       + (SELECT count(*) FROM budget_items           WHERE ministry LIKE '%Sister and Women%')
       + (SELECT count(*) FROM budget_proposals       WHERE ministry LIKE '%Sister and Women%')
       + (SELECT count(*) FROM budget_change_requests WHERE ministry LIKE '%Sister and Women%')
    INTO stale;
  IF stale <> 0 THEN
    RAISE EXCEPTION '% row(s) still carry the old spelling. Nothing has been changed.', stale;
  END IF;
END $$;

-- One name, in the register, on the post, on the role and on the holder.
SELECT (SELECT name  FROM ministries WHERE name LIKE '%Women%')            AS ministry,
       (SELECT name  FROM offices    WHERE grants_role = 'EXCO_SWF')       AS office,
       (SELECT label FROM app_roles  WHERE key = 'EXCO_SWF')               AS role_label,
       (SELECT array_to_string(ministries, ' | ') FROM user_roles
         WHERE lower(email) = 'swm@lcm.org.my')                            AS holder_portfolio;

COMMIT;
