-- The Secretary records elections again.
--
-- 242 took the church's records off the signing officers, and the office
-- register went with them -- but recording who holds which office is the
-- Secretary's job, so it comes back here. The directory, with its IC numbers,
-- does not: that stays with the Administrator.
--
-- Handing back the register alone would not have worked, and would have failed
-- in the worst way. All 23 active offices grant a role, and seating somebody
-- moves that role onto their login -- otherwise the outgoing Treasurer could
-- still approve and the incoming one could not. That write is to user_roles,
-- which the Secretary may not touch, and a refused UPDATE returns no error and
-- no rows: the page reads `error` to decide what to say, so it would have
-- reported "and given Treasurer access" while nothing happened at all.
--
-- Giving them user_roles instead would undo the point of 242 -- role is what
-- decides who may approve what. So the role is not theirs to choose: it comes
-- from the office being filled. seat_office_holder takes an office and a
-- person, reads grants_role off the office itself, and the caller never names a
-- role. A Secretary can seat somebody in an office; they cannot invent a rank,
-- and no office grants a Finance role.
--
-- It also carries the two writes that go with seating somebody, both of which
-- the Secretary has never been able to make: demoting the outgoing holder, and
-- districts.dean_email, which is what leave routing actually reads. A Dean
-- election recorded without it leaves the register and the routing disagreeing,
-- and a pastor's leave going to the previous Dean.

BEGIN;

-- Who keeps the office register: those who keep the records, and the Secretary.
CREATE OR REPLACE FUNCTION public.can_write_offices()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT can_write_people()
      OR EXISTS (SELECT 1 FROM user_roles u
                  WHERE lower(u.email) = lower(auth.jwt() ->> 'email')
                    AND u.role::text = 'SECRETARY');
$fn$;

REVOKE ALL ON FUNCTION public.can_write_offices() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_offices() TO authenticated, service_role;

DROP POLICY IF EXISTS offices_write ON offices;
CREATE POLICY offices_write ON offices FOR ALL TO authenticated
  USING (can_write_offices()) WITH CHECK (can_write_offices());

DROP POLICY IF EXISTS oh_write ON office_holdings;
CREATE POLICY oh_write ON office_holdings FOR ALL TO authenticated
  USING (can_write_offices()) WITH CHECK (can_write_offices());

DROP POLICY IF EXISTS oc_write ON office_categories;
CREATE POLICY oc_write ON office_categories FOR ALL TO authenticated
  USING (can_write_offices()) WITH CHECK (can_write_offices());

-- Seating somebody, with the role that the office carries.
--
-- Definer rights, so it checks for itself rather than resting on a grant: 212
-- is the reason. The role is read from the office and never taken from the
-- caller, which is the whole point -- it is what lets the Secretary record an
-- election without being able to hand out a rank.
CREATE OR REPLACE FUNCTION public.seat_office_holder(
  p_office_id uuid, p_incoming_email text, p_outgoing_email text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  o          record;
  v_note     text := '';
  v_still    boolean;
  v_incoming text := NULLIF(lower(btrim(COALESCE(p_incoming_email, ''))), '');
  v_outgoing text := NULLIF(lower(btrim(COALESCE(p_outgoing_email, ''))), '');
BEGIN
  IF NOT can_write_offices() THEN
    RAISE EXCEPTION 'Only somebody who keeps the office register may seat a holder';
  END IF;

  SELECT id, name, grants_role, kind, district_id INTO o FROM offices WHERE id = p_office_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'No such office'; END IF;

  IF COALESCE(o.grants_role, '') <> '' THEN
    IF v_incoming IS NULL THEN
      v_note := ' — they have no login yet, so add one in Logins & Roles to give them access';
    ELSE
      UPDATE user_roles
         SET role = o.grants_role,
             ministries = CASE WHEN o.grants_role = 'MINISTRY_HEAD'
                               THEN ARRAY[o.name] ELSE '{}'::text[] END,
             updated_at = now()
       WHERE lower(email) = v_incoming;
      IF FOUND THEN
        v_note := ' and given ' || o.grants_role || ' access';
      ELSE
        v_note := ' — they have no login yet, so add one in Logins & Roles to give them access';
      END IF;
    END IF;

    -- The outgoing holder keeps their login and loses the office's powers,
    -- unless another office they still hold grants the same role.
    IF v_outgoing IS NOT NULL AND v_outgoing <> COALESCE(v_incoming, '') THEN
      SELECT EXISTS (
        SELECT 1
          FROM office_holdings h
          JOIN offices x  ON x.id = h.office_id
          JOIN people  pp ON pp.id = h.person_id
         WHERE h.term_end IS NULL
           AND h.office_id <> o.id
           AND x.grants_role = o.grants_role
           AND (lower(COALESCE(pp.user_email, '')) = v_outgoing
             OR lower(COALESCE(pp.email, ''))      = v_outgoing)
      ) INTO v_still;
      IF NOT v_still THEN
        UPDATE user_roles SET role = 'STAFF', ministries = '{}'::text[], updated_at = now()
         WHERE lower(email) = v_outgoing;
      END IF;
    END IF;
  END IF;

  -- Leave routing reads districts.dean_email, so a new Dean has to land there
  -- too, or the register and the routing disagree.
  IF o.kind = 'DEAN' AND o.district_id IS NOT NULL THEN
    UPDATE districts SET dean_email = v_incoming WHERE id = o.district_id;
    v_note := v_note || CASE WHEN v_incoming IS NULL
      THEN ' — they have no email on file, so leave routing cannot reach them yet'
      ELSE ' and leave for that district now routes to them' END;
  END IF;

  RETURN v_note;
END $fn$;

REVOKE ALL ON FUNCTION public.seat_office_holder(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seat_office_holder(uuid, text, text) TO authenticated, service_role;

COMMIT;
