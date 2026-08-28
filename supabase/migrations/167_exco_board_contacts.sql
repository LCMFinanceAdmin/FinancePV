-- 167: who to tell when a budget change is requested.
--
-- An EXCO member asking to change an approved budget needs the board told, but
-- an EXCO member cannot read the People directory — people_read is limited to
-- can_manage_people() or your own row — so under their own session the join
-- from office_holdings to a person's email returns nothing. The notification
-- would silently reach no one, which is the failure mode that looks like
-- success.
--
-- A definer function is the house answer (my_payroll_employee_id, dean_history)
-- and the right one here: what it exposes is the name and work address of the
-- church's current office holders, which is published information, and nothing
-- else about them.

DROP FUNCTION IF EXISTS exco_board_contacts();

CREATE FUNCTION exco_board_contacts()
RETURNS TABLE (name TEXT, email TEXT, office TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH board AS (
    -- The EXCO portfolios and the church officers who sit with them, plus the
    -- General Manager, who is appointed rather than elected.
    SELECT p.full_name AS name,
           lower(COALESCE(NULLIF(p.user_email, ''), p.email)) AS email,
           o.name AS office
      FROM office_holdings h
      JOIN offices o ON o.id = h.office_id
      JOIN people  p ON p.id = h.person_id
     WHERE o.active
       AND (h.term_end IS NULL OR h.term_end >= CURRENT_DATE)
       AND (o.kind IN ('EXCO', 'CHURCH') OR o.grants_role = 'GENERAL_MANAGER')
    UNION ALL
    -- Finance keeps the budget, so they are told whatever the board looks like.
    SELECT COALESCE(NULLIF(u.full_name, ''), u.email),
           lower(u.email),
           'Finance Executive'
      FROM user_roles u
     WHERE u.role IN ('FINANCE_ADMIN', 'FINANCE_ADMIN_2', 'FINANCE_ADMIN_3')
  )
  SELECT DISTINCT ON (email) name, email, office
    FROM board
   WHERE email LIKE '%@%'
   ORDER BY email, office;
$$;

GRANT EXECUTE ON FUNCTION exco_board_contacts() TO authenticated;

COMMENT ON FUNCTION exco_board_contacts() IS
  'Current EXCO portfolios, church officers, the GM and Finance — name and work address only. Used to tell the board about budget change requests.';

SELECT count(*) AS board_contacts FROM exco_board_contacts();
