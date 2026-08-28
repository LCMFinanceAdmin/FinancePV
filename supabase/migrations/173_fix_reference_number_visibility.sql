-- 173: staff could not apply for leave at all.
--
-- next_leave_no() takes MAX(leave_no) over leave_applications and adds one. It
-- was not SECURITY DEFINER, so it ran as whoever called it — and la_read only
-- shows you your own applications. An ordinary member of staff therefore
-- counted over zero rows, got LV-2026-001, and the insert died on
--
--   duplicate key value violates unique constraint "leave_applications_leave_no_key"
--
-- because that number belonged to somebody else's application. The effect is
-- that from the moment the first leave application existed, nobody except its
-- owner and Finance could file one. It looked like a numbering bug and was
-- really a visibility bug: the function could not see what it was counting.
--
-- next_loan_app_no() is written the same way against lapp_read, which restricts
-- the same way, so staff loan applications failed identically. Both are fixed
-- here; only leave was reported.
--
-- Two changes per function.
--
-- SECURITY DEFINER, so the count is over every row rather than the caller's
-- own. That is the actual fix. It reveals nothing: the function returns a
-- reference number, not anybody's leave.
--
-- And the number is now assigned by a BEFORE INSERT trigger rather than fetched
-- by the client beforehand. Reading the maximum in one round trip and inserting
-- in another leaves a window where two people get the same number; doing it
-- inside the inserting transaction, behind an advisory lock, closes it. The
-- trigger honours a number that was passed in, so a client still sending one
-- keeps working while it is updated.

-- ── Leave ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION next_leave_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr     TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix TEXT := 'LV-' || yr || '-';
  last   INT;
BEGIN
  -- Serialises allocation between concurrent applications. Held to the end of
  -- the calling transaction, which is the insert itself when this runs from
  -- the trigger below.
  PERFORM pg_advisory_xact_lock(hashtext('leave_no'));
  SELECT COALESCE(MAX(CAST(SUBSTRING(leave_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM leave_applications WHERE leave_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_leave_no() TO authenticated;

CREATE OR REPLACE FUNCTION assign_leave_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.leave_no IS NULL OR NEW.leave_no = '' THEN
    NEW.leave_no := next_leave_no();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_leave_no ON leave_applications;
CREATE TRIGGER trg_assign_leave_no
  BEFORE INSERT ON leave_applications
  FOR EACH ROW EXECUTE FUNCTION assign_leave_no();

-- ── Staff loans, same shape, same fault ───────────────────────────────────
CREATE OR REPLACE FUNCTION next_loan_app_no()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr     TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  prefix TEXT := 'LA-' || yr || '-';
  last   INT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('loan_app_no'));
  SELECT COALESCE(MAX(CAST(SUBSTRING(loan_app_no FROM LENGTH(prefix)+1) AS INT)), 0)
    INTO last FROM loan_applications WHERE loan_app_no LIKE prefix || '%';
  RETURN prefix || LPAD((last + 1)::TEXT, 3, '0');
END;
$$;

GRANT EXECUTE ON FUNCTION next_loan_app_no() TO authenticated;

CREATE OR REPLACE FUNCTION assign_loan_app_no()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.loan_app_no IS NULL OR NEW.loan_app_no = '' THEN
    NEW.loan_app_no := next_loan_app_no();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_loan_app_no ON loan_applications;
CREATE TRIGGER trg_assign_loan_app_no
  BEFORE INSERT ON loan_applications
  FOR EACH ROW EXECUTE FUNCTION assign_loan_app_no();

SELECT next_leave_no() AS next_leave, next_loan_app_no() AS next_loan;
