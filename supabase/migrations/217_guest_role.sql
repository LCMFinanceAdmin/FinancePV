-- 217: a Guest role, for people who are owed money but work for nobody.
--
-- A volunteer who bought refreshments, a vendor owed for a repair, a council
-- member who paid for petrol. None of them are EXCO and none are on LCM's
-- payroll, so until now there was no role that fitted: giving them STAFF would
-- have handed them leave, salary and loan pages that mean nothing for them,
-- and giving them nothing left them unable to ask for their own money back.
--
-- Guest is deliberately the smallest role in the system:
--
--   * raise a payment request and follow it — the request goes to the
--     ministry's own EXCO to verify, exactly as any other request does, so a
--     guest cannot put anything into the finance queue that a member of the
--     church has not vouched for;
--   * read the church's structure and who currently holds each elected office,
--     which is reference material, not data.
--
-- It is assigned by HQ under Settings -> Access & Roles, like every other role.
-- It is NOT what an unknown address falls back to: migration 158 and the
-- no-access page exist precisely because an unrecognised address used to fall
-- through to STAFF, and STAFF may raise vouchers. Signing in still proves only
-- that somebody controls an inbox.

-- ── The role ───────────────────────────────────────────────────────────────
-- is_system, because the code knows the name: nav.tsx offers the two pages
-- below to it, and lib/user-profile.ts refuses it employment entitlements.
-- Deleting the row would not remove either behaviour.
INSERT INTO app_roles (key, label, description, assignable, is_system, sort_order)
VALUES (
  'GUEST',
  'Guest',
  'Not employed by LCM and not on the EXCO. May claim money back and read the church directory.',
  TRUE, TRUE, 900
)
ON CONFLICT (key) DO UPDATE
  SET label       = EXCLUDED.label,
      description = EXCLUDED.description,
      assignable  = TRUE,
      is_system   = TRUE;

-- ── A guest is never LCM staff ─────────────────────────────────────────────
-- is_lcm_staff decides leave, salary, loans and claim entitlements, and it
-- defaults to TRUE where it is unset so that nobody was locked out when the
-- column arrived. For a guest that default is exactly wrong, and it is read
-- straight from this table in more than one place — components/auth/staff-only
-- reads the column itself rather than going through the profile helper — so
-- the guarantee belongs here rather than in whichever reader remembers.
CREATE OR REPLACE FUNCTION guest_is_never_lcm_staff()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role = 'GUEST' THEN
    NEW.is_lcm_staff := FALSE;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guest_is_never_lcm_staff ON user_roles;
CREATE TRIGGER trg_guest_is_never_lcm_staff
  BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION guest_is_never_lcm_staff();

UPDATE user_roles SET is_lcm_staff = FALSE
 WHERE role = 'GUEST' AND is_lcm_staff IS DISTINCT FROM FALSE;

-- ── What a guest may read ──────────────────────────────────────────────────
-- districts, congregations, offices and office_holdings are already readable
-- by anybody signed in. The names are not: people carries IC numbers, dates of
-- birth, addresses and bank details, and its policy admits only Finance, the
-- General Manager, the signatories and the Administrator — plus each person to
-- their own row. That policy is right and stays untouched.
--
-- So the two functions below reach past it as definers and return names and
-- nothing else. No email, no telephone, no address, no identification, no
-- employment detail, no money. If either is ever asked to return a contact
-- detail, that is the moment to stop and ask whose decision it is.

CREATE OR REPLACE FUNCTION guest_church_directory()
RETURNS TABLE (district TEXT, congregation TEXT, head_pastor TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    d.name,
    c.name,
    hp.nm
  FROM congregations c
  LEFT JOIN districts d ON d.id = c.district_id
  -- LATERAL with LIMIT 1 rather than a join: a head pastor's address can
  -- appear in more than one of people's three address columns, and a plain
  -- join would list the congregation twice.
  LEFT JOIN LATERAL (
    SELECT COALESCE(NULLIF(TRIM(p.preferred_name), ''), p.full_name) AS nm
    FROM people p
    WHERE c.head_pastor_email IS NOT NULL
      AND lower(c.head_pastor_email) IN (
            lower(COALESCE(p.user_email, '')),
            lower(COALESCE(p.work_email, '')),
            lower(COALESCE(p.email, ''))
          )
    LIMIT 1
  ) hp ON TRUE
  ORDER BY d.name NULLS LAST, c.name;
$$;

CREATE OR REPLACE FUNCTION guest_elected_offices()
RETURNS TABLE (kind TEXT, office TEXT, holder TEXT, since DATE)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.kind,
    o.name,
    COALESCE(NULLIF(TRIM(p.preferred_name), ''), p.full_name),
    h.term_start
  FROM offices o
  JOIN office_holdings h ON h.office_id = o.id AND h.term_end IS NULL
  JOIN people p          ON p.id = h.person_id
  WHERE o.active
  -- The constitutional offices first, then the portfolios.
  ORDER BY (o.kind = 'CHURCH') DESC, o.sort_order, o.name;
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC, and Supabase's anon
-- role inherits PUBLIC — see migration 212, where exactly this shipped two
-- privileged functions to anybody holding the browser key. These two return
-- only names, but a directory of a church's clergy free to query without an
-- account is still not what was asked for.
REVOKE EXECUTE ON FUNCTION guest_church_directory() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION guest_elected_offices()  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION guest_church_directory() TO authenticated;
GRANT EXECUTE ON FUNCTION guest_elected_offices()  TO authenticated;

-- guest_is_never_lcm_staff() needs no grant: Postgres refuses to call a trigger
-- function outside a trigger, which is why 212 left the trigger functions alone.
