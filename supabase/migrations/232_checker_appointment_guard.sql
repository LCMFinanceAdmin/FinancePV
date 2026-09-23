-- 232: only the ministry's own people may appoint its checker.
--
-- 231 gave the appointed checker read access to that ministry's vouchers,
-- which is what makes the appointment useful. The ministries table, though,
-- carries a single policy — ministries_all, USING (auth.role() = 'authenticated')
-- — so every signed-in account can write every column of it. Together those
-- two facts mean anybody with an account could have written their own address
-- into checker_email for any ministry and read its vouchers a moment later.
-- Guests included: a guest is authenticated.
--
-- RLS cannot express "these columns are different from those ones", so the
-- guard is a trigger. It leaves the rest of the table exactly as permissive as
-- it was, which is its own problem and a wider one than this migration should
-- quietly decide.
--
-- can_manage_ministry_verifiers is reused deliberately: appointing somebody to
-- check a ministry's vouchers and appointing somebody to verify them are the
-- same kind of authority, and they should not drift apart.

CREATE OR REPLACE FUNCTION guard_ministry_checker()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.checker_email IS DISTINCT FROM OLD.checker_email
     OR NEW.checker_name IS DISTINCT FROM OLD.checker_name THEN
    IF NOT can_manage_ministry_verifiers(OLD.name) THEN
      RAISE EXCEPTION
        'Only the EXCO Member for %, Finance or the General Manager may appoint who checks its vouchers.',
        OLD.name
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION guard_ministry_checker() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ministries_checker_guard ON ministries;
CREATE TRIGGER ministries_checker_guard
  BEFORE UPDATE ON ministries
  FOR EACH ROW
  EXECUTE FUNCTION guard_ministry_checker();

-- An INSERT could smuggle the same thing in by creating a ministry that names
-- a checker from the outset.
CREATE OR REPLACE FUNCTION guard_ministry_checker_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF COALESCE(NEW.checker_email, '') <> '' AND NOT can_manage_ministry_verifiers(NEW.name) THEN
    RAISE EXCEPTION
      'A new ministry cannot be created with a checker already appointed.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION guard_ministry_checker_insert() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS ministries_checker_guard_insert ON ministries;
CREATE TRIGGER ministries_checker_guard_insert
  BEFORE INSERT ON ministries
  FOR EACH ROW
  EXECUTE FUNCTION guard_ministry_checker_insert();
