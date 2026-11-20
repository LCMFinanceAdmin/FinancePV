-- 269: one spelling for YAY, and the portfolio on Joel's account.
--
-- 268 gave Reena the Education portfolio. Joel Liew holds Young Adults & Youth
-- on the same terms — EXCO_YAY, open term, empty ministries, so the budget page
-- tells him "No Ministry Assigned" and he can verify nothing. The same fix,
-- except that his committee's name does not survive the journey.
--
-- Education works because it is spelled "Education" everywhere. YAY is spelled
-- two ways that never meet:
--
--   register      offices.name, ministries.name     Young Adults & Youth (YAY)
--   pickers       submit, payments, gm-claims and   Young Adult and Youth (YAY)
--                 budget, each with its own
--                 hardcoded list
--   one voucher   pvs.ministry                      Young Adult and Youth (YAY)
--
-- holds_ministry() compares the array on the account against the string on the
-- row, trimmed and lower-cased and otherwise literal, and mayVerifyFor()
-- expands only the declared parent/child links. Neither bridges a spelling. So
-- whichever of the two went onto Joel's account, half his committee's work
-- would have been invisible to him, and nothing would have said so — a policy
-- refusal returns no error.
--
-- Migration 121 met this in 2026 and said which one is right: "YAY is Young
-- Adults & Youth. The register had the two words the wrong way round, and
-- vouchers carry a third spelling again." It corrected offices and ministries
-- and stopped there, because the pickers are hardcoded in page files and a
-- migration cannot reach them. This finishes it from both ends: the four lists
-- are corrected in the same commit, and the one row already carrying the old
-- spelling is brought across here.
--
-- Deliberately NOT touched: SWF, which is split the same way and the other way
-- round — the register says "Sister and Women Fellowship (SWF)" and the pickers
-- say "Sisters". 121 recorded what YAY ought to be; nothing records which of
-- those two is the fellowship's own name, and guessing at a women's fellowship's
-- name is not a thing to do inside a migration about youth. Linda Wong's
-- account carries the register spelling, so she is at least self-consistent.
-- It wants an answer from someone who knows, then the same treatment.
--
-- After this, "Young Adult and Youth (YAY)" appears nowhere in the codebase or
-- the data. The one voucher moves with it, so no history is stranded under a
-- name nothing else uses.

BEGIN;

-- ── 1. The voucher ────────────────────────────────────────────────────────
-- One row today. Written as a general correction rather than against that id,
-- so any other row that picked up the old spelling before the pages were
-- rebuilt comes across too.
UPDATE pvs
   SET ministry = 'Young Adults & Youth (YAY)'
 WHERE btrim(ministry) = 'Young Adult and Youth (YAY)';

-- The same correction everywhere else a ministry name is recorded, for the same
-- reason. All three are expected to be empty; they are here so that a row
-- raised between this migration being written and the pages being deployed is
-- not left behind under a dead name.
UPDATE budget_items           SET ministry = 'Young Adults & Youth (YAY)'
 WHERE btrim(ministry) = 'Young Adult and Youth (YAY)';
UPDATE budget_proposals       SET ministry = 'Young Adults & Youth (YAY)'
 WHERE btrim(ministry) = 'Young Adult and Youth (YAY)';
UPDATE budget_change_requests SET ministry = 'Young Adults & Youth (YAY)'
 WHERE btrim(ministry) = 'Young Adult and Youth (YAY)';

-- ── 2. The portfolio ──────────────────────────────────────────────────────
-- Keyed the same way as 268: the name is read from the office his own open term
-- grants, never typed here, so it cannot drift from the register.
CREATE TEMP TABLE portfolio ON COMMIT DROP AS
SELECT ur.email AS login,
       o.name   AS ministry,
       p.full_name AS person
  FROM user_roles ur
  JOIN people p          ON lower(p.user_email) = lower(ur.email)
  JOIN office_holdings h ON h.person_id = p.id AND h.term_end IS NULL
  JOIN offices o         ON o.id = h.office_id
                        AND o.grants_role = ur.role
                        AND o.active
 WHERE lower(ur.email) = 'yay@lcm.org.my'
   AND ur.role = 'EXCO_YAY'
   AND o.name = 'Young Adults & Youth (YAY)';

DO $$
DECLARE n INT;
BEGIN
  SELECT count(*) INTO n FROM portfolio;
  IF n <> 1 THEN
    RAISE EXCEPTION 'Expected 1 YAY seat to fill, found %. Either the account is no longer EXCO_YAY, or the open term has moved, or the office has been renamed again — check the register before forcing this.', n;
  END IF;
END $$;

UPDATE user_roles ur SET
  ministries = ARRAY(SELECT DISTINCT x
                       FROM unnest(COALESCE(ur.ministries, '{}') || ARRAY[pf.ministry]) x
                      WHERE btrim(x) <> ''),
  updated_at = NOW()
  FROM portfolio pf
 WHERE lower(ur.email) = lower(pf.login);

-- ── 3. Both halves, or neither ────────────────────────────────────────────
DO $$
DECLARE stale INT; ok BOOLEAN;
BEGIN
  SELECT (SELECT count(*) FROM pvs                   WHERE btrim(ministry) = 'Young Adult and Youth (YAY)')
       + (SELECT count(*) FROM budget_items          WHERE btrim(ministry) = 'Young Adult and Youth (YAY)')
       + (SELECT count(*) FROM budget_proposals      WHERE btrim(ministry) = 'Young Adult and Youth (YAY)')
       + (SELECT count(*) FROM budget_change_requests WHERE btrim(ministry) = 'Young Adult and Youth (YAY)')
    INTO stale;
  IF stale <> 0 THEN
    RAISE EXCEPTION '% row(s) still carry the old spelling. Nothing has been changed.', stale;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE lower(ur.email) = 'yay@lcm.org.my'
       AND lower(btrim('Young Adults & Youth (YAY)')) =
           ANY (SELECT lower(btrim(x)) FROM unnest(ur.ministries) x)
  ) INTO ok;
  IF NOT ok THEN
    RAISE EXCEPTION 'YAY is still not on Joel''s account. Nothing has been changed.';
  END IF;
END $$;

-- What this leaves: the seat, the portfolio on it, and one spelling.
SELECT ur.email, ur.full_name, ur.role, ur.ministries,
       (SELECT count(*) FROM pvs WHERE ministry = 'Young Adults & Youth (YAY)') AS vouchers,
       (SELECT count(*) FROM ministries m WHERE m.name = 'Young Adults & Youth (YAY)') AS in_register
  FROM user_roles ur
 WHERE lower(ur.email) = 'yay@lcm.org.my';

COMMIT;
