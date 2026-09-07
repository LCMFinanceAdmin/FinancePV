-- 192: make user_roles.is_lcm_staff impossible to get wrong.
--
-- 191 derived the flag from payroll and put triggers on both people and
-- payroll_employees to keep it in step. It left one way in: the column defaults
-- to true, and neither trigger fires when a user_roles row is created.
--
-- So an account made for somebody LCM does not employ would arrive holding
-- is_lcm_staff = true and keep it until somebody happened to edit their
-- directory record. That is precisely the case 191 was written for — 22 of the
-- 24 people concerned have an address recorded and no account yet, so this is
-- the path they will all come down.
--
-- The RPCs are already safe: my_claim_entitlements() and my_leave_entitlements()
-- test payroll themselves and would return nothing regardless of this flag. The
-- damage would have been a My Leave page that opens, renders, and shows an
-- empty entitlement table — which reads as the app being broken rather than as
-- the rule working, and would send the person to Finance to report a bug.
--
-- Derived on write instead of defaulted. The column keeps existing because the
-- sidebar and StaffOnly read it without wanting a round trip per render; it
-- simply is no longer something anybody can set. An UPDATE that tries is
-- silently corrected rather than rejected, because the flag is not an opinion
-- to be overruled — it is a restatement of whether a payroll record exists, and
-- the way to change it is to change that.

CREATE OR REPLACE FUNCTION derive_is_lcm_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.is_lcm_staff := is_lcm_payroll(NEW.email);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_derive_is_lcm_staff ON user_roles;
CREATE TRIGGER trg_derive_is_lcm_staff
  BEFORE INSERT OR UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION derive_is_lcm_staff();

-- The default is now only ever a value the trigger immediately replaces.
-- Set to false so that if the trigger is ever dropped, the failure is a
-- locked-out employee who complains, not a silent entitlement to somebody who
-- was never owed one.
ALTER TABLE user_roles ALTER COLUMN is_lcm_staff SET DEFAULT FALSE;

COMMENT ON COLUMN user_roles.is_lcm_staff IS
  'Derived, never set: true when an active payroll record exists for this address (192). To change it, change the payroll record.';

SELECT count(*) FILTER (WHERE is_lcm_staff)     AS on_payroll,
       count(*) FILTER (WHERE NOT is_lcm_staff) AS not_on_payroll,
       count(*)                                 AS accounts
  FROM user_roles;
