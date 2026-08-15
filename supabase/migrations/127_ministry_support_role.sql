-- 127: the supporting tier under an EXCO portfolio.
--
-- Education Desk is not EXCO. The Education EXCO appointed somebody to run the
-- desk and verify what is spent against its budget lines, so that the portfolio
-- holder does not have to see every honorarium — but the desk does not hold the
-- portfolio, cannot speak for the rest of Education, and answers to the EXCO
-- who appointed it.
--
-- Today that person holds MINISTRY_HEAD with ministries = {'Education Desk'},
-- which reads as "EXCO Member" everywhere and ranks them alongside the people
-- who hold portfolios. That is the confusion.
--
-- MINISTRY_SUPPORT is the tier. What makes it work is what it does NOT carry:
-- no ministries of its own, and therefore no inherent authority over anything.
-- Everything a desk may verify comes from a delegation in ministry_verifiers
-- (migration 114) — granted by the portfolio holder, scoped to the whole
-- ministry or to named budget lines, and withdrawable. The rank is real rather
-- than decorative: an EXCO can act without a desk, a desk cannot act without an
-- EXCO's permission.
--
-- What this migration deliberately does NOT do is mint a role per portfolio.
-- Authority is already per-portfolio — it comes from user_roles.ministries, so
-- Mission's holder cannot touch Education's vouchers today. Splitting
-- MINISTRY_HEAD into eight keys would turn every role check in RLS and the edge
-- functions into a list of eight, and would mean a portfolio added through
-- Offices & Elections could not get a role without a deploy — undoing the point
-- of making portfolios data in 121. The portfolio is shown next to the role
-- instead, so "EXCO Member" reads "EXCO — Mission".

INSERT INTO app_roles (key, label, description, assignable, is_system, sort_order)
VALUES (
  'MINISTRY_SUPPORT',
  'Ministry Desk',
  'Appointed by an EXCO member to run a desk and verify what it spends. Holds no portfolio and no authority of its own — only what the EXCO delegates, and only for as long as it is delegated.',
  TRUE, TRUE, 95
)
ON CONFLICT (key) DO NOTHING;

-- A desk with a ministry attached would be able to verify that ministry's
-- vouchers outright, which is the thing this tier exists to prevent. Enforced
-- rather than documented, because the election flow and the access page both
-- write to this column.
CREATE OR REPLACE FUNCTION clear_ministries_for_support()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'MINISTRY_SUPPORT' AND COALESCE(array_length(NEW.ministries, 1), 0) > 0 THEN
    NEW.ministries := '{}';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_no_ministries ON user_roles;
CREATE TRIGGER trg_support_no_ministries
  BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION clear_ministries_for_support();

COMMENT ON FUNCTION clear_ministries_for_support() IS
  'A Ministry Desk holds no portfolio. Its authority comes from ministry_verifiers, never from user_roles.ministries.';
