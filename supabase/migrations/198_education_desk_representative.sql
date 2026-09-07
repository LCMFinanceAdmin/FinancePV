-- 198: Chan Mun Kwan represents Education for one budget line, not all of it.
--
-- He holds the Education Desk office, and the delegation recorded for him
-- covered the whole Education ministry — projects = {}, which
-- is_delegated_verifier reads as "everything this committee books". What he
-- actually represents is one item of Education's budget.
--
-- The line is called "Education Desk Project", not "Education Desk". That
-- matters and is the reason this is a migration rather than a one-line update:
-- the check is `p_project = ANY(v.projects)` against pvs.project verbatim, so a
-- near-miss does not narrow the delegation, it empties it. He would have kept
-- the office, kept the row, kept the appearance of authority, and been unable
-- to verify anything at all — and the failure would have surfaced as a voucher
-- quietly sitting in nobody's queue.
--
-- Written against the budget line as it is spelled in budget_items rather than
-- as it is said aloud, and asserted before the update so that a rename makes
-- this file fail loudly instead of silently granting nothing.
--
-- Changing it later is a screen, not a migration: Ministry → Representatives,
-- where the budget lines are tick-boxes and "the whole ministry" is one of them.
-- 197's derivation is untouched by this. That grants a ministry from an office
-- held; this narrows what a named representative may do within one. A portfolio
-- holder verifies their committee's spending; a representative verifies the
-- part they were given.

DO $$
DECLARE
  v_line   TEXT := 'Education Desk Project';
  v_person UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM budget_items
     WHERE ministry = 'Education' AND project_name = v_line
  ) THEN
    RAISE EXCEPTION
      'No budget line "%" under Education. Scoping a delegation to a line that does not exist grants nothing.', v_line;
  END IF;

  SELECT id INTO v_person FROM people WHERE full_name = 'Chan Mun Kwan';
  IF v_person IS NULL THEN
    RAISE EXCEPTION 'Chan Mun Kwan is not in the directory.';
  END IF;

  UPDATE ministry_verifiers
     SET projects = ARRAY[v_line],
         note = TRIM(BOTH ' ' FROM COALESCE(NULLIF(note, ''), '')
                || ' Representative for the Education Desk line only (198).'),
         updated_at = NOW()
   WHERE person_id = v_person
     AND lower(ministry) = 'education';
END $$;

-- ── And the role switcher, put back ───────────────────────────────────────
-- /switch-role changes your own row so a flow can be walked from another
-- seat, and it had been left on TREASURER. Everything Finance-only was
-- therefore hidden from the Finance Executive: recording a committee's
-- verification, sending a voucher on without one, managing representatives.
UPDATE user_roles
   SET role = 'FINANCE_ADMIN', updated_at = NOW()
 WHERE lower(email) = 'finance@lcm.org.my'
   AND role <> 'FINANCE_ADMIN';

SELECT (SELECT role FROM user_roles WHERE lower(email) = 'finance@lcm.org.my') AS finance_role,
       v.ministry, v.projects, v.active,
       is_delegated_verifier('educationdesk@lcm.org.my', 'Education', 'Education Desk Project') AS may_verify_the_line,
       is_delegated_verifier('educationdesk@lcm.org.my', 'Education', 'Lay Leaders Training')   AS may_verify_another_line,
       is_delegated_verifier('educationdesk@lcm.org.my', 'Education', NULL)                     AS may_verify_unassigned
  FROM ministry_verifiers v
  JOIN people p ON p.id = v.person_id
 WHERE p.full_name = 'Chan Mun Kwan';
