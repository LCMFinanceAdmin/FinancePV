-- 176: sick leave rises with service, and hospitalisation is an aggregate.
--
-- Unlike 174, this does NOT come from the Terms and Conditions. That document
-- is silent on sick leave — it covers out-patient treatment as a claim and
-- never says how many days off somebody has. The source here is section 60F of
-- the Employment Act 1955:
--
--     less than 2 years of service      14 days
--     2 years but less than 5           18 days
--     5 years or more                   22 days
--
--   and, where hospitalisation is necessary, 60 days in the aggregate in each
--   calendar year — aggregate meaning inclusive of the ordinary sick leave
--   above, not on top of it.
--
-- The app gave everybody a flat 14 and nothing at all for hospitalisation, so
-- anyone past two years' service was under-credited and a hospital stay had no
-- entitlement to draw on.
--
-- Two things worth saying plainly, because this is law rather than the church's
-- own document:
--
--   * Whether ministers of religion are "employees" under the Act is a question
--     the church should put to its own advisers. These bands are applied to
--     every category regardless, which is consistent with what the church
--     already did — it gave pastors the statutory 14 — and is the more generous
--     reading. Narrowing it later is a row in leave_entitlement_bands.
--
--   * The aggregate rule genuinely reduces what hospitalisation offers: a
--     person who has taken 18 ordinary sick days has 42 hospitalisation days
--     left, not 60. Modelling it as a separate 60 would over-grant, so
--     leave_types gains a column saying which other leave counts against it.

-- Which other leave draws on the same ceiling. NULL for everything else.
ALTER TABLE leave_types ADD COLUMN IF NOT EXISTS aggregate_with TEXT;
COMMENT ON COLUMN leave_types.aggregate_with IS
  'Code of another leave type whose days also count against this one''s ceiling. Hospitalisation includes ordinary sick leave — Employment Act 1955, s60F.';

-- ── Ordinary sick leave, by service ───────────────────────────────────────
DELETE FROM leave_entitlement_bands WHERE leave_type_code = 'MEDICAL';
INSERT INTO leave_entitlement_bands (leave_type_code, min_years, max_years, days, source) VALUES
  ('MEDICAL', 0,    1, 14, 'Employment Act 1955, s60F(1)(aa)(i) — under 2 years'),
  ('MEDICAL', 2,    4, 18, 'Employment Act 1955, s60F(1)(aa)(ii) — 2 to under 5 years'),
  ('MEDICAL', 5, NULL, 22, 'Employment Act 1955, s60F(1)(aa)(iii) — 5 years and over');

-- ── Hospitalisation: 60 days, inclusive of the above ──────────────────────
UPDATE leave_types
   SET days_per_year  = 60,
       aggregate_with = 'MEDICAL'
 WHERE code = 'HOSPITALISATION';

DELETE FROM leave_entitlement_bands WHERE leave_type_code = 'HOSPITALISATION';
INSERT INTO leave_entitlement_bands (leave_type_code, min_years, max_years, days, source) VALUES
  ('HOSPITALISATION', 0, NULL, 60,
   'Employment Act 1955, s60F(1)(b) — 60 days in aggregate, including ordinary sick leave');

-- my_leave_entitlements() gains the aggregate column so the page can apply the
-- rule rather than each caller remembering it.
DROP FUNCTION IF EXISTS my_leave_entitlements();

CREATE FUNCTION my_leave_entitlements()
RETURNS TABLE (code TEXT, days NUMERIC, years_of_service INT, aggregate_with TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT lt.code,
         leave_entitlement(lt.code, auth.jwt() ->> 'email'),
         CASE WHEN service_start_for(auth.jwt() ->> 'email') IS NULL THEN NULL
              ELSE EXTRACT(YEAR FROM age(CURRENT_DATE,
                     service_start_for(auth.jwt() ->> 'email')))::INT END,
         lt.aggregate_with
    FROM leave_types lt
   WHERE lt.active;
$$;

GRANT EXECUTE ON FUNCTION my_leave_entitlements() TO authenticated;

-- How the workforce falls across the new sick-leave bands.
SELECT count(*) FILTER (WHERE yrs BETWEEN 0 AND 1) AS sick_14,
       count(*) FILTER (WHERE yrs BETWEEN 2 AND 4) AS sick_18,
       count(*) FILTER (WHERE yrs >= 5)            AS sick_22
  FROM (SELECT EXTRACT(YEAR FROM age(CURRENT_DATE, pe.date_commenced))::INT AS yrs
          FROM payroll_employees pe
         WHERE pe.status = 'ACTIVE' AND pe.date_commenced IS NOT NULL) s;
