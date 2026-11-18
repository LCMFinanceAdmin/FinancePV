-- 266 — Somebody who left LCM and came back.
--
-- A returning pastor is given a new letter of employment, so the engagement is
-- new: a new salary that does not pick up where the old one stopped, a new
-- commencement date, and from it a new increment cycle, a new 13th-month count
-- and a yearly sheet that starts the month he returned. All of that is right,
-- and `date_commenced` has to carry it or the sheet reports pay for the years
-- he was away.
--
-- What was wrong is that the fifteen years before had nowhere to go. His page
-- read "0 years", and the box labelled "Prior Experience (years)" that looked
-- like the answer has been written to since 2021 and read by nothing — not the
-- salary, not the bonus, not a single page. It is zero for all eighty-four
-- employees, so nothing is lost by it becoming something real.
--
-- Two dates replace it.
--
--   first_joined         when they first joined LCM, however many engagements
--                        ago. Display, and leave.
--   previous_service_to  when the earlier engagement ended, so the break is
--                        visible rather than inferred from a gap.
--
-- NOTHING THE PAYROLL COMPUTES READS THEM. The increment cycle, the 13th
-- month, the pro-rating of a joining month and the yearly sheet all go on
-- reading `date_commenced`, which is this engagement. That separation is the
-- whole point: one date is arithmetic and the other is history, and the bug
-- was having only one box for both.
--
-- LEAVE IS THE EXCEPTION, and deliberately. Confirmed with the user: a
-- returning pastor's earlier service counts towards his leave band, so
-- service_start_for prefers first_joined where one is recorded. Fifteen years
-- and a year away is still fifteen years of service for annual and medical
-- leave; it is not a fresh start at fourteen days.

BEGIN;

ALTER TABLE payroll_employees
  ADD COLUMN IF NOT EXISTS first_joined        DATE,
  ADD COLUMN IF NOT EXISTS previous_service_to DATE;

COMMENT ON COLUMN payroll_employees.first_joined IS
  'When they first joined LCM, across every engagement. NULL means this is the '
  'only one, and date_commenced is the whole story. Read by the leave service '
  'band and by the display of total service — never by the payroll arithmetic, '
  'which belongs to the current engagement. See migration 266.';

COMMENT ON COLUMN payroll_employees.previous_service_to IS
  'When the earlier engagement ended, for somebody who left and came back. '
  'Records the break so it is visible rather than guessed from the gap between '
  'first_joined and date_commenced.';

COMMENT ON COLUMN payroll_employees.prior_experience_years IS
  'SUPERSEDED by first_joined (migration 266). Written since 2021 and read by '
  'nothing; zero for every employee. The column is kept rather than dropped so '
  'no historic row loses a value, but nothing writes it any more.';

-- Leave service: the first joining date wins where there is one.
--
-- The ORDER BY still prefers a row with a commencement date over one without,
-- so a person with several payroll records resolves the same way as before —
-- this only changes which date is taken off the row that wins.
CREATE OR REPLACE FUNCTION public.service_start_for(p_email text)
 RETURNS date
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(pe.first_joined, pe.date_commenced, p.date_joined)
    FROM people p
    LEFT JOIN payroll_employees pe ON pe.person_id = p.id
   WHERE lower(p.user_email) = lower(p_email)
      OR lower(COALESCE(p.work_email, '')) = lower(p_email)
   ORDER BY pe.date_commenced NULLS LAST
   LIMIT 1;
$function$;

COMMIT;
