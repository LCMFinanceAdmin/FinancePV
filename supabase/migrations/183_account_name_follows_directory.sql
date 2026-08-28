-- 183: an account should be called what the directory calls the person.
--
-- Three accounts disagreed with their own directory record:
--
--   educationdesk@  called "educationdesk@lcm.org.my"  — the address itself,
--                   never replaced with a name
--   secretary@      called "Rev David Ho"              — a title and a short
--                   form, where the directory has David Ho Chee Way
--   treasurer@      called "Paul Low"                  — confirmed as the
--                   English name; the man is Low Hong Ceong, and the directory
--                   already carries Paul Low as his known-as
--
-- The account name is what appears beside a voucher, on an approval and in the
-- sidebar, so a person can be two different people depending on which screen
-- you are looking at. The directory is where a name is maintained, so the
-- account follows it — the same direction as is_pastor and congregation_id in
-- 182, and for the same reason.
--
-- preferred_name is deliberately left alone. Chan Mun Kwan is "Rev Chan" and
-- Low Hong Ceong is "Paul Low" there already, which is exactly where a name
-- somebody actually goes by belongs. Titles are not written into the name at
-- all: the app derives "Rev." from ordination, so a full_name carrying it
-- would print it twice.

UPDATE user_roles u
   SET full_name = p.full_name, updated_at = NOW()
  FROM people p
 WHERE lower(p.user_email) = lower(u.email)
   AND trim(COALESCE(p.full_name, '')) <> ''
   AND lower(trim(COALESCE(u.full_name, ''))) IS DISTINCT FROM lower(trim(p.full_name));

-- Fold it into the trigger from 182 rather than adding a second one, so there
-- is one place that answers "what does the account inherit from the person".
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
     SET is_pastor       = (NEW.category = 'PASTOR' OR NEW.ordination IS NOT NULL),
         congregation_id = COALESCE(NEW.congregation_id, u.congregation_id),
         full_name       = COALESCE(NULLIF(trim(NEW.full_name), ''), u.full_name),
         updated_at      = NOW()
   WHERE lower(u.email) = lower(NEW.user_email);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_account_from_person ON people;
CREATE TRIGGER trg_sync_account_from_person
  AFTER INSERT OR UPDATE OF category, ordination, congregation_id, user_email, full_name ON people
  FOR EACH ROW EXECUTE FUNCTION sync_account_from_person();

SELECT count(*) AS accounts_still_disagreeing
  FROM user_roles u JOIN people p ON lower(p.user_email) = lower(u.email)
 WHERE lower(trim(COALESCE(u.full_name,''))) IS DISTINCT FROM lower(trim(p.full_name));
