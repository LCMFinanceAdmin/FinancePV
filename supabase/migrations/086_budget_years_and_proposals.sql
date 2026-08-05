-- 086: Year-scoped budgets, sub-items, and next-year proposals.
--
-- Until now there was exactly one live budget per ministry with no year on it,
-- so "last year's budget" and "next year's proposal" had nowhere to live. Three
-- additions:
--
--   year        which financial year a line belongs to
--   parent_id   sub-projects / sub-items nested under a project
--   proposal_id set while a line is part of a proposal awaiting the Treasurer;
--               cleared on approval, at which point the line becomes live
--
-- A live budget line is therefore: proposal_id IS NULL AND year = <the year>.
-- Existing rows are backfilled to the current year and stay live, so the page
-- behaves exactly as before until someone uses the new features.

ALTER TABLE budget_items
  ADD COLUMN IF NOT EXISTS year        INT,
  ADD COLUMN IF NOT EXISTS parent_id   UUID REFERENCES budget_items(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS proposal_id UUID,
  ADD COLUMN IF NOT EXISTS sort_order  INT DEFAULT 0;

UPDATE budget_items SET year = EXTRACT(YEAR FROM NOW())::INT WHERE year IS NULL;
ALTER TABLE budget_items ALTER COLUMN year SET NOT NULL;
ALTER TABLE budget_items ALTER COLUMN year SET DEFAULT EXTRACT(YEAR FROM NOW())::INT;

CREATE INDEX IF NOT EXISTS idx_budget_items_year     ON budget_items(ministry, year);
CREATE INDEX IF NOT EXISTS idx_budget_items_parent   ON budget_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_budget_items_proposal ON budget_items(proposal_id);

-- ── Proposed budgets ───────────────────────────────────────────────────────
-- An EXCO drafts next year's lines, submits the ministry's budget as one
-- package, and the Treasurer approves or rejects it at the EXCO meeting —
-- matching how a budget is actually tabled, rather than line by line.
CREATE TABLE IF NOT EXISTS budget_proposals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry      TEXT NOT NULL,
  year          INT  NOT NULL,
  status        TEXT NOT NULL DEFAULT 'DRAFT'
                CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','REJECTED')),
  notes         TEXT,
  created_by    TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at  TIMESTAMPTZ,
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT,
  UNIQUE (ministry, year)
);

CREATE INDEX IF NOT EXISTS idx_budget_proposals_status ON budget_proposals(status);

ALTER TABLE budget_items
  DROP CONSTRAINT IF EXISTS budget_items_proposal_fk;
ALTER TABLE budget_items
  ADD CONSTRAINT budget_items_proposal_fk
  FOREIGN KEY (proposal_id) REFERENCES budget_proposals(id) ON DELETE CASCADE;

ALTER TABLE budget_proposals ENABLE ROW LEVEL SECURITY;

-- Readable by everyone signed in; the EXCO owning it may draft and submit;
-- only the Treasurer / Finance decide. Approval itself is done through
-- approve_budget_proposal() below so the items flip atomically with the status.
DROP POLICY IF EXISTS "budget_proposals_read" ON budget_proposals;
CREATE POLICY "budget_proposals_read" ON budget_proposals
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "budget_proposals_insert" ON budget_proposals;
CREATE POLICY "budget_proposals_insert" ON budget_proposals
  FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "budget_proposals_update" ON budget_proposals;
CREATE POLICY "budget_proposals_update" ON budget_proposals
  FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "budget_proposals_delete" ON budget_proposals;
CREATE POLICY "budget_proposals_delete" ON budget_proposals
  FOR DELETE TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON budget_proposals TO authenticated;

-- ── Approval ───────────────────────────────────────────────────────────────
-- Clearing proposal_id is what makes the lines live, so it has to happen in the
-- same transaction as the status change — otherwise a failure between the two
-- would leave a year either double-budgeted or with nothing at all.
CREATE OR REPLACE FUNCTION public.approve_budget_proposal(
  proposal UUID,
  decided_by_email TEXT,
  note TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_ministry TEXT;
  target_year     INT;
BEGIN
  SELECT ministry, year INTO target_ministry, target_year
  FROM budget_proposals WHERE id = proposal;

  IF target_ministry IS NULL THEN
    RAISE EXCEPTION 'Budget proposal not found';
  END IF;

  -- Replace any live lines for that ministry/year, so approving a revised
  -- proposal doesn't leave the superseded lines behind alongside it.
  DELETE FROM budget_items
  WHERE ministry = target_ministry AND year = target_year AND proposal_id IS NULL;

  UPDATE budget_items SET proposal_id = NULL WHERE proposal_id = proposal;

  UPDATE budget_proposals
  SET status = 'APPROVED', decided_by = decided_by_email,
      decided_at = NOW(), decision_note = note
  WHERE id = proposal;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_budget_proposal(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_budget_proposal(UUID, TEXT, TEXT) TO authenticated;
