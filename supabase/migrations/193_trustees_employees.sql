-- 193: say who employs Eddie Kwan and Sean Cham.
--
-- 191 correctly withheld LCM's leave and claim entitlements from both, because
-- neither is on LCM payroll. It could not say why, so the app's account of them
-- was "not employed by LCM" and nothing more — which is true and reads as an
-- omission, or worse as an error in their record.
--
-- They are employed by the Trustees of the Lutheran Church in Malaysia
-- Registered: a separate registered body, closely associated with LCM, which
-- holds property on its behalf. The organisation has existed in this database
-- since 105, kind TRUST, marked a related party. What has never been used is
-- people.organisation_id — all 105 directory records have it null — so the
-- directory could describe a separate employer and had never been asked to.
--
-- This changes no entitlement. The rule stands and the outcome for these two is
-- the same either way: not LCM payroll, so no LCM leave, loans or claims, and a
-- claim for LCM work goes through a project with an EXCO resolution behind it.
-- What changes is that the church can now see the reason, on the record, rather
-- than inferring it from an absence.
--
-- Worth naming for whoever picks this up next: the Trustees employ people, and
-- this system has no payroll, leave or claim structure for them. That is not an
-- oversight to fix quietly — it is a question about whether one system should
-- run two employers' payrolls, and it belongs to the people who decide that,
-- not to a migration.
--
-- org_role is left null deliberately. Their titles here — Building Manager,
-- Staff — are the roles LCM's own app gives them, and what the Trustees call
-- them is not something to invent. It is one field, on the People page, when
-- somebody knows.

UPDATE people p
   SET organisation_id = (SELECT id FROM organisations WHERE short_name = 'LCM Trustees'),
       is_employed     = TRUE,
       updated_at      = NOW()
 WHERE lower(p.user_email) IN ('eddie.kwan@lcm.org.my', 'sean.cham@lcm.org.my')
   AND p.organisation_id IS NULL;

INSERT INTO person_notes (person_id, body, tag, author_name)
SELECT p.id,
       'Employed by the Trustees of the Lutheran Church in Malaysia Registered, a separate '
    || 'registered body closely associated with LCM — not by LCM itself. Recorded by migration '
    || '193. LCM leave, staff loans and claim entitlements therefore do not apply; a claim for '
    || 'LCM work goes under a project with an EXCO resolution behind it.',
       'EMPLOYMENT', 'migration 193'
  FROM people p
 WHERE lower(p.user_email) IN ('eddie.kwan@lcm.org.my', 'sean.cham@lcm.org.my')
   AND NOT EXISTS (
         SELECT 1 FROM person_notes n
          WHERE n.person_id = p.id AND n.author_name = 'migration 193');

-- ── Let the pages say it ──────────────────────────────────────────────────
-- SECURITY DEFINER and no argument: it answers only about the caller, so it
-- cannot be used to ask who employs somebody else. Returns null for LCM's own
-- staff, who have no separate employer to name.
CREATE OR REPLACE FUNCTION my_employer()
RETURNS TABLE (name TEXT, short_name TEXT, relationship TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.name, o.short_name, o.relationship
    FROM people p
    JOIN organisations o ON o.id = p.organisation_id
   WHERE lower(p.user_email) = lower(auth.jwt() ->> 'email')
      OR lower(COALESCE(p.work_email, '')) = lower(auth.jwt() ->> 'email')
   LIMIT 1;
$$;

COMMENT ON FUNCTION my_employer() IS
  'The organisation that employs the caller, when it is not LCM. Null for LCM payroll staff. Used to explain why LCM employment entitlements do not apply.';

GRANT EXECUTE ON FUNCTION my_employer() TO authenticated;

SELECT p.full_name, p.user_email, o.name AS employer, o.kind,
       p.payroll_employee_id IS NOT NULL AS on_lcm_payroll,
       (SELECT is_lcm_staff FROM user_roles u WHERE lower(u.email) = lower(p.user_email)) AS lcm_entitlements
  FROM people p LEFT JOIN organisations o ON o.id = p.organisation_id
 WHERE lower(p.user_email) IN ('eddie.kwan@lcm.org.my', 'sean.cham@lcm.org.my');
