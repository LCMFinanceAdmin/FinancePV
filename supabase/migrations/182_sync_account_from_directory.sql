-- 182: leave routing was reading facts the directory holds.
--
-- resolveLeaveApprovers() asks user_roles for is_pastor and congregation_id.
-- Both are stale, and the effect is that ordained people are routed as though
-- they were office staff:
--
--   * is_pastor is FALSE on four accounts whose directory record says
--     category PASTOR and ordination REVEREND — the Bishop, the Secretary,
--     the Mission EXCO member and Chan Mun Kwan. Their leave would go to the
--     Bishop as staff, rather than to their head pastor, council Chairman and
--     Dean as the Terms require (A9, note 6(a)).
--
--   * congregation_id is empty on every account, because migration 169 wrote
--     the congregation onto people where it belongs. Without it the pastor
--     branch finds no congregation, so no head pastor, no council and no
--     district, and falls through to the Bishop anyway.
--
-- So the fix is not to type the answers in again; it is to derive them from
-- the directory, which is the same shape as districts.dean_email and
-- people.payroll_employee_id — one place holds the fact, the other follows.
--
-- What this does NOT settle: who approves the Bishop's own leave. He has no
-- congregation, so the pastoral chain falls back to the Bishop, who is
-- himself, and self-approval is skipped — leaving nobody. The Terms are silent
-- on it. That needs a decision from the church, not a guess here, and the
-- application form already says plainly when no approver can be worked out.

-- ── Backfill ──────────────────────────────────────────────────────────────
UPDATE user_roles u
   SET is_pastor = TRUE, updated_at = NOW()
  FROM people p
 WHERE lower(p.user_email) = lower(u.email)
   AND (p.category = 'PASTOR' OR p.ordination IS NOT NULL)
   AND COALESCE(u.is_pastor, FALSE) = FALSE;

UPDATE user_roles u
   SET congregation_id = p.congregation_id, updated_at = NOW()
  FROM people p
 WHERE lower(p.user_email) = lower(u.email)
   AND p.congregation_id IS NOT NULL
   AND u.congregation_id IS DISTINCT FROM p.congregation_id;

-- ── Keep them in step ─────────────────────────────────────────────────────
-- Editing somebody's ordination or congregation in the People Directory is
-- exactly when their leave routing should change. Without this the two drift
-- apart again the first time anybody is moved between churches.
CREATE OR REPLACE FUNCTION sync_account_from_person()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.user_email IS NULL OR NEW.user_email = '' THEN
    RETURN NEW;
  END IF;

  UPDATE user_roles u
     SET is_pastor      = (NEW.category = 'PASTOR' OR NEW.ordination IS NOT NULL),
         congregation_id = COALESCE(NEW.congregation_id, u.congregation_id),
         updated_at      = NOW()
   WHERE lower(u.email) = lower(NEW.user_email)
     AND (u.is_pastor IS DISTINCT FROM (NEW.category = 'PASTOR' OR NEW.ordination IS NOT NULL)
          OR (NEW.congregation_id IS NOT NULL
              AND u.congregation_id IS DISTINCT FROM NEW.congregation_id));

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_from_person ON people;
CREATE TRIGGER trg_sync_account_from_person
  AFTER INSERT OR UPDATE OF category, ordination, congregation_id, user_email ON people
  FOR EACH ROW EXECUTE FUNCTION sync_account_from_person();

-- What changed, and what is still unroutable.
SELECT count(*) FILTER (WHERE u.is_pastor) AS accounts_now_pastor,
       count(*) FILTER (WHERE u.congregation_id IS NOT NULL) AS accounts_with_congregation,
       count(*) AS accounts_total
  FROM user_roles u;
