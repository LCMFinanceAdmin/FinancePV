-- 222: a Dean's account says which district they lead.
--
-- 220 gave the six Deans accounts as STAFF, on the reasoning that leading a
-- district is recorded in districts.dean_email and derived from there, so no
-- role was needed. That was half right and half wrong.
--
-- It is true that isDean comes from the district record and that nothing in
-- the code reads a DEAN_ role. It is false that no role was intended: five
-- exist in app_roles, each office in the register carries grants_role naming
-- one, and Settings -> Offices & Elections sets a holder's role from it when
-- they are seated. Settings -> Access & Roles then shows a role as coming
-- from a post by matching grants_role against the account's role — so a Dean
-- sitting at STAFF reads there as somebody whose access was set by hand and
-- has drifted from the register, which is exactly what the two screens exist
-- to prevent.
--
-- Nothing changes about what they can do. This makes the account agree with
-- the register, and makes the sidebar say "Dean — Northern District" rather
-- than "Staff" to a man who is not staff in any sense he would recognise.

-- ── The sixth district ──────────────────────────────────────────────────────
-- Five districts have a Dean role; Orang Asli has none, and its office row
-- carries no grants_role. Nothing marks that as deliberate — the other five
-- are identical in shape and were plainly written together — so it reads as
-- one that was missed. Mirrored from an existing one rather than composed, so
-- it cannot drift in wording from its five siblings.
INSERT INTO app_roles (key, label, description, assignable, is_system, sort_order)
SELECT 'DEAN_ORANG_ASLI_DISTRICT',
       'Dean — Orang Asli District',
       'Leads Orang Asli District. Verifies and approves leave for the pastors serving in it.',
       assignable, is_system, sort_order + 4
FROM app_roles WHERE key = 'DEAN_CENTRAL_DISTRICT_1'
ON CONFLICT (key) DO NOTHING;

UPDATE offices
   SET grants_role = 'DEAN_ORANG_ASLI_DISTRICT'
 WHERE name = 'Dean — Orang Asli District'
   AND grants_role IS NULL;

-- ── Seat each Dean in the role their own office grants ─────────────────────
-- Driven from the register rather than from a list written here, so a district
-- renamed or a Dean replaced tomorrow does not leave this migration lying.
-- Only accounts sitting at STAFF or GUEST are touched: anything else was
-- chosen by somebody and is not ours to overwrite.
UPDATE user_roles ur
   SET role = o.grants_role
  FROM offices o
  JOIN office_holdings h ON h.office_id = o.id AND h.term_end IS NULL
  JOIN people p ON p.id = h.person_id
 WHERE o.active
   AND o.grants_role LIKE 'DEAN%'
   AND lower(ur.email) IN (
         lower(COALESCE(p.user_email, '')),
         lower(COALESCE(p.work_email, '')),
         lower(COALESCE(p.email, ''))
       )
   AND ur.role IN ('STAFF', 'GUEST');
