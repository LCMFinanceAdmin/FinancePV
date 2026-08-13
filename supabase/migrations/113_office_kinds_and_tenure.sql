-- 113: Not every committee is an EXCO portfolio, and not every post is for life.
--
-- Two things the register could not say.
--
-- First, kind. Education Desk and Finance & Development sat under EXCO
-- Portfolios because that was the only committee-shaped bucket, but they are
-- project and supporting committees — they do not carry an EXCO seat, and
-- listing them there overstates what their members were elected to.
--
-- Second, tenure. is_elected answered "elected or appointed", which is not the
-- same question as "how long for". A project committee that runs for eighteen
-- months and a permanent appointment are both "not elected", and the register
-- had no way to tell them apart or to prompt anyone that the first one has run
-- out.

-- ── Kind: a place for committees that are not EXCO ────────────────────────
ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_kind_check;
ALTER TABLE offices ADD CONSTRAINT offices_kind_check
  CHECK (kind IN ('CHURCH', 'EXCO', 'DEAN', 'APPOINTED', 'COMMITTEE', 'PROJECT'));

-- ── Tenure: how long the post is held for ─────────────────────────────────
ALTER TABLE offices
  ADD COLUMN IF NOT EXISTS tenure TEXT NOT NULL DEFAULT 'ELECTED'
    CHECK (tenure IN ('ELECTED', 'PERMANENT', 'TEMPORARY'));

-- Back-fill from what the register already knew: elected posts are elected,
-- everything else was standing until somebody replaced it.
UPDATE offices SET tenure = CASE WHEN is_elected THEN 'ELECTED' ELSE 'PERMANENT' END;

-- is_elected stays, because the election flow and its wording read it. It is
-- now derived from tenure rather than being a second opinion: a trigger keeps
-- them in step whichever one is written, so no caller has to remember both.
CREATE OR REPLACE FUNCTION sync_office_tenure()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- OLD is unassigned on INSERT, and SQL does not promise to short-circuit an
  -- OR, so the insert case is separated rather than folded into the condition
  -- below. Written the other way this raises "record old is not assigned yet"
  -- on every new post.
  IF TG_OP = 'INSERT' THEN
    NEW.is_elected := (NEW.tenure = 'ELECTED');
  ELSIF NEW.tenure IS DISTINCT FROM OLD.tenure THEN
    NEW.is_elected := (NEW.tenure = 'ELECTED');
  ELSIF NEW.is_elected IS DISTINCT FROM OLD.is_elected THEN
    NEW.tenure := CASE WHEN NEW.is_elected THEN 'ELECTED' ELSE 'PERMANENT' END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_office_tenure ON offices;
CREATE TRIGGER trg_office_tenure
  BEFORE INSERT OR UPDATE ON offices
  FOR EACH ROW EXECUTE FUNCTION sync_office_tenure();

-- ── The two that were filed in the wrong place ────────────────────────────
-- Named rather than guessed at: reclassifying a post changes what its holders
-- appear to have been elected to, so only these two, and only if they are
-- still where they were.
UPDATE offices
   SET kind = 'PROJECT', tenure = 'TEMPORARY'
 WHERE kind = 'EXCO'
   AND name IN ('Education Desk', 'Finance and Development', 'Finance & Development');

-- ── An end in sight ───────────────────────────────────────────────────────
-- A temporary post is one somebody expects to finish. Recording when it is
-- meant to is what lets the register say "this ran out in March" rather than
-- carrying it as current for years.
ALTER TABLE office_holdings
  ADD COLUMN IF NOT EXISTS expected_end DATE;

COMMENT ON COLUMN offices.tenure IS
  'ELECTED — stands for a term; PERMANENT — held until replaced; TEMPORARY — a project or relief post with an expected end';
COMMENT ON COLUMN offices.kind IS
  'CHURCH, EXCO, DEAN, APPOINTED, COMMITTEE, or PROJECT for project and supporting committees that carry no EXCO seat';
COMMENT ON COLUMN office_holdings.expected_end IS
  'When a temporary post is meant to finish. Not an end date — the term is still open until it is closed.';
