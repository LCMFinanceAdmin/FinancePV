-- 142: the five districts, and a Dean's post for each.
--
-- The machinery for Deans has been in place for a while and has never had any
-- data in it. districts and congregations were both empty, and there was no
-- Dean's post on the register, so leave from a pastor had nowhere to go but
-- the Bishop.
--
-- ── Where a Dean's authority actually comes from ──────────────────────────
-- Not from a role. lib/leave-approvers.ts decides who signs a pastor's leave
-- by reading districts.dean_email, and lib/user-profile.ts derives isDean the
-- same way. That is deliberate and it is right: the Dean is a property of the
-- district, so there is exactly one place to look and a handover is one edit.
--
-- The roles created here are therefore titles, not powers, and it matters that
-- this is said plainly rather than discovered later. What they buy is that the
-- directory, Access & Roles and every voucher can say "Dean — Northern
-- District" instead of "Staff", which is what the person actually is.
--
-- They cannot drift apart from the authority, because recording an appointment
-- to one of these posts does both at once: the offices page writes the role
-- from grants_role AND writes districts.dean_email from the same person, in
-- the same action. Neither can be set without the other.

INSERT INTO districts (name)
SELECT d FROM (VALUES
  ('Central District 1'),
  ('Central District 2'),
  ('Central District 3'),
  ('Northern District'),
  ('Southern District')
) AS v(d)
WHERE NOT EXISTS (SELECT 1 FROM districts x WHERE x.name = v.d);

-- One role per district, named as the person is named.
INSERT INTO app_roles (key, label, description, assignable, is_system, sort_order)
SELECT 'DEAN_' || regexp_replace(upper(d.name), '[^A-Z0-9]+', '_', 'g'),
       'Dean — ' || d.name,
       'Leads ' || d.name || '. Verifies and approves leave for the pastors serving in it.',
       TRUE, TRUE,
       130 + row_number() OVER (ORDER BY d.name)
  FROM districts d
ON CONFLICT (key) DO UPDATE
  SET label = EXCLUDED.label, description = EXCLUDED.description;

-- One post per district, on the register under Deans.
--
-- Named for the district rather than "Dean — X", matching how an EXCO
-- portfolio is named for the portfolio: the section heading already says what
-- kind of post it is, and the role beside it says the title in full.
--
-- PERMANENT rather than ELECTED because these are appointments — held until
-- somebody replaces them. If the constitution sets a term for Deans, giving
-- the post a term length in the form switches it over.
INSERT INTO offices (name, kind, district_id, grants_role, is_elected, single_holder, tenure, active, sort_order)
SELECT d.name,
       'DEAN',
       d.id,
       'DEAN_' || regexp_replace(upper(d.name), '[^A-Z0-9]+', '_', 'g'),
       FALSE,
       TRUE,
       'PERMANENT',
       TRUE,
       100 + row_number() OVER (ORDER BY d.name)
  FROM districts d
 WHERE NOT EXISTS (
   SELECT 1 FROM offices o WHERE o.kind = 'DEAN' AND o.district_id = d.id
 );
