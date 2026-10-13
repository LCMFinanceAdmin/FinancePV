-- A ministry may write the lines of its own budget, while it is still a draft.
--
-- 236 narrowed the money tables to Finance. 237 handed back budget_proposals
-- and budget_change_requests, saying "a ministry proposes its own budget and
-- asks for its own changes; that is theirs" -- and left budget_items behind,
-- which is where the lines actually are. So since 1 October an EXCO member has
-- been unable to add a line to their own budget at all, including next year's
-- draft, and every line has had to go round as a change request for Finance to
-- apply. That was an oversight in 237 rather than a decision.
--
-- The line it is drawn at: a ministry writes its own budget while the budget is
-- a proposal. Once the EXCO has approved it in meeting the lines are live, and
-- changing a live budget is a request somebody decides -- which is the rule the
-- handbook already describes and the change-request flow already implements.
-- budget_items.proposal_id is exactly that distinction: not null while it
-- belongs to a proposal, null once approve_budget_proposal makes it live.

BEGIN;

DROP POLICY IF EXISTS budget_items_insert ON budget_items;
CREATE POLICY budget_items_insert ON budget_items FOR INSERT TO authenticated
  WITH CHECK (
    can_write_money()
    OR (holds_ministry(ministry)
        AND proposal_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM budget_proposals p
                     WHERE p.id = proposal_id AND p.status IN ('DRAFT', 'REJECTED'))));

DROP POLICY IF EXISTS budget_items_update ON budget_items;
CREATE POLICY budget_items_update ON budget_items FOR UPDATE TO authenticated
  USING (
    can_write_money()
    OR (holds_ministry(ministry)
        AND proposal_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM budget_proposals p
                     WHERE p.id = proposal_id AND p.status IN ('DRAFT', 'REJECTED'))))
  WITH CHECK (
    can_write_money()
    OR (holds_ministry(ministry)
        AND proposal_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM budget_proposals p
                     WHERE p.id = proposal_id AND p.status IN ('DRAFT', 'REJECTED'))));

DROP POLICY IF EXISTS budget_items_delete ON budget_items;
CREATE POLICY budget_items_delete ON budget_items FOR DELETE TO authenticated
  USING (
    can_write_money()
    OR (holds_ministry(ministry)
        AND proposal_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM budget_proposals p
                     WHERE p.id = proposal_id AND p.status IN ('DRAFT', 'REJECTED'))));

-- Three things this deliberately does not allow, each of which the chain
-- depends on:
--
--   A submitted proposal is locked. The figures must not move underneath the
--   meeting that is about to vote on them, which is why SUBMITTED is absent
--   from the list above as well as APPROVED.
--
--   A live line -- proposal_id null -- is not the ministry's to edit. That is a
--   change request, decided by somebody else.
--
--   Another ministry's lines are not yours at all, draft or otherwise.

COMMIT;
