-- 152: where a pastor is posted.
--
-- The form asked which LCM congregation somebody serves, which quietly assumed
-- every pastor serves one. Several do not: a retired pastor on contract can be
-- based at HQ running a desk, ordained, pastoring no church at all. Asked that
-- question they had to answer it wrongly or leave it blank, and blank reads as
-- "not recorded yet" rather than "not applicable".
--
-- So the question comes first and the follow-up depends on it: posted at HQ,
-- with a department, or to a congregation, with a congregation.
--
-- payroll_employees already carries posting_type for exactly this reason
-- (CHURCH or OFFICE). This is the same distinction on the directory side; they
-- are not joined because a pastor exists in the directory whether or not LCM
-- pays them.
ALTER TABLE people ADD COLUMN IF NOT EXISTS posting TEXT;
ALTER TABLE people DROP CONSTRAINT IF EXISTS people_posting_check;
ALTER TABLE people ADD CONSTRAINT people_posting_check
  CHECK (posting IS NULL OR posting IN ('HQ','CONGREGATION'));

COMMENT ON COLUMN people.posting IS
  'Where somebody in ministry is posted: HQ (with hq_department) or CONGREGATION (with congregation_id). Null for anyone the question does not apply to.';

-- Backfill from what is already recorded, which is unambiguous either way.
UPDATE people SET posting = 'CONGREGATION'
 WHERE posting IS NULL AND pastor_standing IS NOT NULL AND congregation_id IS NOT NULL;

UPDATE people SET posting = 'HQ'
 WHERE posting IS NULL AND pastor_standing IS NOT NULL
   AND congregation_id IS NULL
   AND COALESCE(btrim(hq_department), '') <> '';
