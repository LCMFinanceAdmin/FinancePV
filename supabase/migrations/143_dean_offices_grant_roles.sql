-- 143: the Dean's post grants the Dean's role.
--
-- 142 created the districts and the roles, and expected to create the posts —
-- but a district already creates its own Dean's post through a trigger, so the
-- guard in 142 correctly did nothing and the posts came from there instead.
-- Those carry grants_role = NULL, which is what this fixes.
--
-- Without it the register shows a Dean's post, appointing somebody to it sets
-- districts.dean_email so their leave routing works, and their role stays
-- STAFF — authority right, title wrong. The one action should do both.
--
-- The trigger is taught the same thing, so a sixth district gets a post that
-- grants its role without anybody remembering to come back here. It looks the
-- role up rather than assuming it exists: a district added before its role
-- simply gets a post granting nothing, which is the state we are fixing now
-- and is recoverable, rather than an insert that fails and takes the district
-- with it.

CREATE OR REPLACE FUNCTION dean_role_key(p_district TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT 'DEAN_' || regexp_replace(upper(btrim(p_district)), '[^A-Z0-9]+', '_', 'g');
$$;

REVOKE ALL ON FUNCTION dean_role_key(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dean_role_key(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION create_dean_office_for_district()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_role TEXT;
BEGIN
  SELECT key INTO v_role FROM app_roles WHERE key = dean_role_key(NEW.name);

  INSERT INTO offices (name, kind, grants_role, district_id, is_elected, single_holder, tenure, sort_order)
  VALUES ('Dean — ' || NEW.name, 'DEAN', v_role, NEW.id, FALSE, TRUE, 'PERMANENT', 50)
  ON CONFLICT (name) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- The five that already exist.
UPDATE offices o
   SET grants_role = dean_role_key(d.name),
       single_holder = TRUE
  FROM districts d
 WHERE o.district_id = d.id
   AND o.kind = 'DEAN'
   AND o.grants_role IS NULL
   AND EXISTS (SELECT 1 FROM app_roles r WHERE r.key = dean_role_key(d.name));
