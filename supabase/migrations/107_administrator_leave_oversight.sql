-- 107: The Administrator can see leave, and only see it.
--
-- She keeps the directories and watches the leave: who has applied, who has
-- signed, who is sitting on something, and how many days each person has left.
-- None of that was visible to her. leave_applications is readable by the
-- applicant, by a named approver, or by is_finance_admin_or_senior() — and she
-- is none of the three, so the queue was empty and the balances unreachable.
--
-- The obvious fix would be to add ADMINISTRATOR to is_finance_admin_or_senior().
-- That would be wrong twice over: that function also guards the UPDATE policies
-- here, so she would be able to approve leave she is only meant to oversee, and
-- it guards budgets, vouchers and payroll besides.
--
-- So this is a separate, read-only capability, added only to the SELECT
-- policies.

CREATE OR REPLACE FUNCTION can_oversee_leave()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles ur
     WHERE ur.email = (auth.jwt() ->> 'email')
       AND ur.role = 'ADMINISTRATOR'
  );
$$;

GRANT EXECUTE ON FUNCTION can_oversee_leave() TO authenticated;

-- Reading every application. The UPDATE policy is deliberately left alone:
-- approving stays with the people the application names.
DROP POLICY IF EXISTS "la_read" ON leave_applications;
CREATE POLICY "la_read" ON leave_applications FOR SELECT TO authenticated
  USING (
    applicant_email = (auth.jwt() ->> 'email')
    OR is_finance_admin_or_senior()
    OR can_oversee_leave()
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(required_approvers) AS ra
      WHERE ra->>'email' = (auth.jwt() ->> 'email')
    )
  );

-- Replacement days earned feed the balance, so a balance without them is
-- wrong. Read only — awarding a replacement day stays with Finance.
DROP POLICY IF EXISTS "rde_read" ON replacement_days_earned;
CREATE POLICY "rde_read" ON replacement_days_earned FOR SELECT TO authenticated
  USING (
    employee_email = (auth.jwt() ->> 'email')
    OR is_finance_admin_or_senior()
    OR can_oversee_leave()
  );

COMMENT ON FUNCTION can_oversee_leave() IS
  'Read-only sight of everyone''s leave — the Administrator. Never grants approval.';
