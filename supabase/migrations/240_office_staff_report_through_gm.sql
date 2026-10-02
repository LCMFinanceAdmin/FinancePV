-- Full-time office staff answer to the General Manager before the Bishop.
--
-- Asked for on 2 October 2026: every member of office staff is to be approved
-- by the General Manager first, with the Bishop's signature following as the
-- acknowledgement. Three people were reaching the Bishop without the General
-- Manager seeing the application at all.
--
-- Two different mechanisms were doing it, which is why this touches two tables:
--
--   Chan Siew Fun, Sean Cham  reports_to = 'BISHOP_ONLY', so the staff rule in
--                             lib/leave-approvers.ts skipped the GM rung.
--   Eddie Kwan                an explicit assignment, which overrides the rules
--                             outright -- Sean Cham then the Bishop, no GM.
--
-- Eddie keeps Sean Cham's signature: Sean heads Trustees and Eddie is under
-- him, which was the instruction of September 2026 and has not been withdrawn.
-- The General Manager is inserted between Sean and the Bishop rather than in
-- place of either, so Eddie's chain becomes Sean, the GM, then the Bishop.
--
-- 'BISHOP_ONLY' keeps its meaning and its one remaining holder: the General
-- Manager himself, who cannot be his own approver. Nothing here changes a
-- pastor's routing -- David Ho Chee Way also holds an assignment, and he is a
-- pastor, so his is left exactly as it stands.

BEGIN;

-- 1. The two routed to the Bishop alone now take the ordinary staff chain.
UPDATE user_roles
   SET reports_to = 'GM_AND_BISHOP', updated_at = now()
 WHERE reports_to = 'BISHOP_ONLY'
   AND is_pastor IS NOT TRUE
   AND role <> 'GENERAL_MANAGER';

-- 2. The General Manager joins Eddie Kwan's assignment, between his department
--    head and the Bishop. The Bishop's rung is pushed down to make room, and
--    the GM is looked up by role rather than written in, so this migration
--    does not hard-code a person into a chain.
DO $$
DECLARE
  v_employee text;
  v_gm_email text;
  v_gm_name  text;
BEGIN
  SELECT email INTO v_employee FROM user_roles
   WHERE full_name ILIKE '%Eddie Kwan%' AND is_pastor IS NOT TRUE;
  SELECT email, full_name INTO v_gm_email, v_gm_name FROM user_roles
   WHERE role = 'GENERAL_MANAGER' ORDER BY email LIMIT 1;

  IF v_employee IS NULL OR v_gm_email IS NULL THEN
    RAISE NOTICE 'skipped: employee or General Manager not found';
    RETURN;
  END IF;

  -- Already on the chain? Then there is nothing to insert and nothing to move.
  IF EXISTS (SELECT 1 FROM leave_approver_assignments
              WHERE employee_email = v_employee AND approver_email = v_gm_email) THEN
    RAISE NOTICE 'skipped: the General Manager is already on this chain';
    RETURN;
  END IF;

  -- Make room at step 2 by moving everything from there down one.
  UPDATE leave_approver_assignments
     SET sort_order = sort_order + 1
   WHERE employee_email = v_employee AND sort_order >= 2;

  INSERT INTO leave_approver_assignments
         (employee_email, approver_email, approver_name, sort_order)
  VALUES (v_employee, v_gm_email, v_gm_name, 2);
END $$;

-- 3. One application was already in flight with the old chain: unsigned, so
--    replacing the chain takes nothing away from anybody. An application that
--    has collected a signature is deliberately left alone -- rewriting a chain
--    under a signature already given would misrepresent what was agreed to.
--
--    The condition describes the stale application rather than naming the
--    applicant: office staff, nobody has signed, and no General Manager on the
--    chain. After step 1 that set is exactly the applications this change
--    invalidated, and a name in a WHERE clause would quietly stop matching the
--    day somebody is renamed.
UPDATE leave_applications a
   SET required_approvers = (
         SELECT jsonb_agg(x ORDER BY (x->>'step')::int)
           FROM (
             SELECT jsonb_build_object(
                      'email', g.email, 'name', g.full_name,
                      'position', 'General Manager', 'step', 1) AS x
               FROM user_roles g WHERE g.role = 'GENERAL_MANAGER'
             UNION ALL
             SELECT jsonb_build_object(
                      'email', b.email, 'name', b.full_name,
                      'position', 'Bishop', 'step', 2) AS x
               FROM user_roles b WHERE b.role = 'BISHOP'
           ) s),
       updated_at = now()
 WHERE a.status = 'PENDING'
   AND COALESCE(jsonb_array_length(a.approvals), 0) = 0
   AND a.applicant_email IN (
         SELECT email FROM user_roles
          WHERE is_pastor IS NOT TRUE
            AND role <> 'GENERAL_MANAGER'
            AND reports_to = 'GM_AND_BISHOP')
   AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(a.required_approvers) r
          WHERE r->>'position' = 'General Manager');

COMMIT;
