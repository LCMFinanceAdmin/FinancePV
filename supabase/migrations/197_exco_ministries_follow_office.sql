-- 197: an EXCO member's ministry follows the office they hold.
--
-- Asked to set the EXCO members' ministries. The mapping turns out not to be
-- something to decide: every EXCO office is named after the ministry it covers,
-- exactly.
--
--   Education · Mission · Orang Asli · Property · Sister and Women Fellowship
--   (SWF) · Social Concern · Stewardship · Young Adults & Youth (YAY)
--
-- Eight offices of kind EXCO, eight ministries of the same names. So the
-- question is never "which ministry does this person verify for" — it is "who
-- holds this office", which the register already answers and which
-- user_roles.ministries was being asked to duplicate by hand.
--
-- This is the pattern the rest of the schema already uses: districts.dean_email
-- decides who is a Dean, an active payroll record decides who is staff (191),
-- and a holding now decides which ministry somebody verifies. The alternative
-- is two places to update and one of them going stale, which the roles guide
-- already warns about in as many words: "Setting a role by hand on someone who
-- holds such a post makes the register and their access disagree."
--
-- ── Additive, never subtractive ──────────────────────────────────────────
-- Recording a holding grants the ministry. Ending one does NOT take it away,
-- and nothing here clears a ministry set by hand.
--
-- That asymmetry is deliberate. Ministries are also assigned for reasons this
-- table knows nothing about — the Education test account holds no office, an
-- interim helper may be given a portfolio without an election — and a trigger
-- that enforced the register as the whole truth would silently strip them.
-- Withdrawing somebody's authority is a decision, and it should be made by a
-- person in Settings, not as a side effect of tidying a term-end date.
--
-- Education Desk is included though its kind is PROJECT rather than EXCO: it
-- is named after a ministry like the others, and expandMinistries() already
-- treats Education and Education Desk as one committee in both directions.

CREATE OR REPLACE FUNCTION ministries_follow_office()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ministry TEXT;
  v_emails   TEXT[];
BEGIN
  -- Offices that are portfolios over a ministry's spending, and only those.
  --
  -- Matching on the name alone is not enough: there is a ministry called
  -- Bishop, being his budget line, and the Bishop's office would have picked it
  -- up. He approves these vouchers already, as a signatory — quietly making him
  -- their verifier too is a permission granted by coincidence of naming, which
  -- is not a way to decide who may commit money. EXCO and PROJECT are the kinds
  -- that mean "holds a portfolio"; CHURCH, DEAN, APPOINTED and COMMITTEE are
  -- offices of other sorts.
  SELECT m.name INTO v_ministry
    FROM offices o
    JOIN ministries m ON m.name = o.name
   WHERE o.id = NEW.office_id
     AND o.kind IN ('EXCO', 'PROJECT');

  IF v_ministry IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT array_remove(ARRAY[lower(p.user_email), lower(p.work_email)], NULL)
    INTO v_emails
    FROM people p WHERE p.id = NEW.person_id;

  IF v_emails IS NULL OR array_length(v_emails, 1) IS NULL THEN
    RETURN NULL;   -- no account yet; recording the holding is still correct
  END IF;

  UPDATE user_roles u
     SET ministries = (
           SELECT array_agg(DISTINCT x)
             FROM unnest(COALESCE(u.ministries, ARRAY[]::TEXT[]) || v_ministry) AS x
         ),
         updated_at = NOW()
   WHERE lower(u.email) = ANY (v_emails)
     AND NOT (v_ministry = ANY (COALESCE(u.ministries, ARRAY[]::TEXT[])));

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ministries_follow_office ON office_holdings;
CREATE TRIGGER trg_ministries_follow_office
  AFTER INSERT OR UPDATE OF office_id, person_id ON office_holdings
  FOR EACH ROW EXECUTE FUNCTION ministries_follow_office();

-- Backfill from the holdings already recorded. Touching office_id rather than
-- writing the logic twice: the trigger is the definition, and a backfill that
-- restated it would be a second definition free to disagree.
UPDATE office_holdings SET office_id = office_id;

-- Undo a grant an earlier run of this file made before the kind check above
-- existed: it matched the Bishop's office to the Bishop budget line. Written
-- down rather than quietly corrected in the database, because a permission that
-- was granted and withdrawn should be legible in the same place as the rule
-- that granted it.
UPDATE user_roles
   SET ministries = array_remove(ministries, 'Bishop'), updated_at = NOW()
 WHERE role = 'BISHOP' AND 'Bishop' = ANY (COALESCE(ministries, ARRAY[]::TEXT[]));

SELECT o.name AS office, p.full_name,
       COALESCE(p.user_email, p.work_email, '(no account)') AS addr,
       (SELECT ministries FROM user_roles u
         WHERE lower(u.email) IN (lower(COALESCE(p.user_email, '')), lower(COALESCE(p.work_email, '')))
         LIMIT 1) AS ministries
  FROM office_holdings oh
  JOIN offices o ON o.id = oh.office_id
  JOIN people p ON p.id = oh.person_id
 WHERE EXISTS (SELECT 1 FROM ministries m WHERE m.name = o.name)
 ORDER BY o.name;
