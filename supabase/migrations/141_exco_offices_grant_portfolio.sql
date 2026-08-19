-- 141: the EXCO portfolios start granting their own seats.
--
-- 138 created the roles and 139 taught the database the family; the app was
-- taught it in the same change. This is the switch, and it is deliberately
-- last: until the code recognised EXCO_EDUCATION as an EXCO seat, pointing an
-- office at it would have quietly stripped whoever held it.
--
-- Two steps, in this order:
--
--   1. Each EXCO office grants its own role, so the next election seats
--      somebody into the named portfolio rather than the generic one.
--   2. Whoever holds one of those offices today moves onto that role, since
--      grants_role only fires when a term is recorded and nobody should have
--      to hold a fresh election to be described correctly.
--
-- MINISTRY_HEAD is left alone wherever it is held by somebody who is not the
-- current holder of an EXCO office. That is an EXCO seat with no portfolio
-- recorded, which is a real state and reads as one.

UPDATE offices o
   SET grants_role = exco_role_key(o.name)
 WHERE o.kind = 'EXCO'
   AND o.active
   AND EXISTS (SELECT 1 FROM app_roles r WHERE r.key = exco_role_key(o.name));

-- Move the sitting holders across. Matched through the person's directory
-- record, which is what office_holdings points at, to the login it belongs to.
WITH seated AS (
  SELECT DISTINCT ON (p.user_email)
         p.user_email,
         o.grants_role,
         o.name AS portfolio
    FROM office_holdings h
    JOIN offices o ON o.id = h.office_id
    JOIN people  p ON p.id = h.person_id
   WHERE o.kind = 'EXCO'
     AND o.active
     AND o.grants_role LIKE 'EXCO/_%' ESCAPE '/'
     AND p.user_email IS NOT NULL
     -- Currently running, on the same reading the register now uses.
     AND h.term_start <= CURRENT_DATE
     AND (h.term_end IS NULL OR h.term_end >= CURRENT_DATE)
   ORDER BY p.user_email, h.term_start DESC
)
UPDATE user_roles u
   SET role = s.grants_role,
       -- The portfolio stays in ministries as well. Everything that decides
       -- WHICH ministry somebody may verify reads that column, and the role
       -- says which seat they hold, not what they may touch.
       ministries = CASE WHEN s.portfolio = ANY(COALESCE(u.ministries, '{}'))
                         THEN u.ministries
                         ELSE COALESCE(u.ministries, '{}') || s.portfolio END,
       updated_at = NOW()
  FROM seated s
 WHERE lower(u.email) = lower(s.user_email)
   AND is_exco_role(u.role);
