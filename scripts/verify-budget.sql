-- Does the budget arithmetic actually say what we think it says?
--
-- The EXCO votes a ministry an allocation and describes in general terms what
-- it is for, without approving the individual projects. So the figures have to
-- tell three things apart: a line running out while the allocation still has
-- room, spending on a project nobody listed, and passing the allocation itself.
-- Only the last is an overspend, and these probes are what proves it.
--
-- Run with: npm run verify:budget
--
-- Everything is inside a transaction that is rolled back, so the probe ministry
-- and its vouchers never survive. The last statement prints a row per probe,
-- failures first.
--
-- ProbeMin 2995: the EXCO voted 50,000. The outline names two projects worth
-- 30,000 between them, leaving 20,000 of headroom for what was not planned.

BEGIN;
INSERT INTO budget_proposals(ministry, year, status, allocation, decided_at, created_by)
VALUES ('ProbeMin', 2995, 'APPROVED', 50000, now(), 'probe@lcm.org.my');

INSERT INTO budget_items(ministry, year, project_name, project_type, estimated_income, estimated_expenses)
VALUES ('ProbeMin', 2995, 'National Day of Prayer', 'expense', 0, 20000),
       ('ProbeMin', 2995, 'Skill-based Training',   'expense', 0, 10000);

-- 15,000 paid against a line, 5,000 paid against a project nobody listed, and
-- 2,000 on its way against the other line.
INSERT INTO pvs(pv_no, ministry, project, amount, status, date)
VALUES ('PROBE-251-1', 'ProbeMin', 'National Day of Prayer',  15000, 'PAID',    '2995-06-01'),
       ('PROBE-251-2', 'ProbeMin', 'Food for the fellowship',  5000, 'PAID',    '2995-06-02'),
       ('PROBE-251-3', 'ProbeMin', 'Skill-based Training',      2000, 'PENDING', '2995-06-03');

CREATE TEMP TABLE probe_results(seq serial, label text, got text, want text);

-- The allocation, the outline, and what the outline leaves spare.
INSERT INTO probe_results(label, got, want)
SELECT 'allocation is the voted figure, not the outline total',
       allocation::text, '50000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995)
UNION ALL SELECT 'the figure is marked as one the EXCO voted',
       allocation_voted::text, 'true' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995)
UNION ALL SELECT 'the outline adds up to less than the allocation',
       planned::text, '30000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995)
UNION ALL SELECT 'headroom is the allocation the outline does not account for',
       headroom::text, '20000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995);

-- Spend that names no line is reported rather than lost.
INSERT INTO probe_results(label, got, want)
SELECT 'spend on an unlisted project counts as unplanned',
       unplanned_spent::text, '5000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995)
UNION ALL SELECT 'the ministry position counts every voucher, planned or not',
       ministry_spent::text, '20000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995)
UNION ALL SELECT 'what is on its way is committed, not spent',
       ministry_committed::text, '2000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995)
UNION ALL SELECT 'the allocation less what has gone and what is coming',
       ministry_remaining::text, '28000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995);

-- The line is spent out. 5,000 of it is left; the allocation has 28,000.
INSERT INTO probe_results(label, got, want)
SELECT 'within the line: nothing is flagged',
       concat_ws(' ', over_budget, over_ministry, drawn_from_ministry), 'false false false'
  FROM budget_project_gate('ProbeMin','National Day of Prayer',4000,NULL,2995)
UNION ALL SELECT 'line exhausted but the allocation covers it: drawn from the ministry',
       concat_ws(' ', over_budget, over_ministry, drawn_from_ministry), 'true false true'
  FROM budget_project_gate('ProbeMin','National Day of Prayer',6000,NULL,2995)
UNION ALL SELECT 'past the allocation itself: over, and not a spill-over',
       concat_ws(' ', over_budget, over_ministry, drawn_from_ministry), 'true true false'
  FROM budget_project_gate('ProbeMin','National Day of Prayer',30000,NULL,2995);

-- An unlisted project draws on the headroom in exactly the same way.
INSERT INTO probe_results(label, got, want)
SELECT 'an unplanned expense within the allocation is not over anything',
       concat_ws(' ', budgeted, over_budget, over_ministry), 'false false false'
  FROM budget_project_gate('ProbeMin','Chairs for the hall',10000,NULL,2995)
UNION ALL SELECT 'an unplanned expense past the allocation is over the ministry',
       concat_ws(' ', budgeted, over_ministry), 'false true'
  FROM budget_project_gate('ProbeMin','Chairs for the hall',30000,NULL,2995);

-- The defect this migration also fixes: the gate used to compare the project
-- with = while the app compared it with case and spacing ignored.
INSERT INTO probe_results(label, got, want)
SELECT 'a line is matched however the project was typed',
       concat_ws(' ', budgeted, budget::text), 'true 20000'
  FROM budget_project_gate('ProbeMin','  national day of  PRAYER ',1,NULL,2995)
UNION ALL SELECT 'and the spend recorded against it is found too',
       spent::text, '15000'
  FROM budget_project_gate('ProbeMin','national day of prayer',1,NULL,2995);

-- A ministry with no budget at all must not read as having one.
INSERT INTO probe_results(label, got, want)
SELECT 'a ministry with no budget is not reported as budgeted',
       concat_ws(' ', ministry_budgeted, over_ministry), 'false false'
  FROM budget_project_gate('NoSuchMinistry','Anything',9999,NULL,2995);

-- The allocation is the EXCO's. Revising it by hand must fail.
DO $$
BEGIN
  UPDATE budget_proposals SET allocation = 90000
   WHERE ministry = 'ProbeMin' AND year = 2995;
  INSERT INTO probe_results(label, got, want)
  VALUES ('an approved allocation cannot be revised by hand', 'allowed', 'refused');
EXCEPTION WHEN others THEN
  INSERT INTO probe_results(label, got, want)
  VALUES ('an approved allocation cannot be revised by hand', 'refused', 'refused');
END $$;

-- But a resolution may change it, which is what the change request does.
DO $$
BEGIN
  PERFORM set_config('lcm.budget_resolution', 'on', true);
  UPDATE budget_proposals SET allocation = 90000
   WHERE ministry = 'ProbeMin' AND year = 2995;
  PERFORM set_config('lcm.budget_resolution', '', true);
  INSERT INTO probe_results(label, got, want)
  VALUES ('a resolution may change it', 'allowed', 'allowed');
EXCEPTION WHEN others THEN
  INSERT INTO probe_results(label, got, want)
  VALUES ('a resolution may change it', 'refused: ' || SQLERRM, 'allowed');
END $$;

INSERT INTO probe_results(label, got, want)
SELECT 'the changed allocation is what the gate now reports',
       allocation::text, '90000' FROM budget_project_gate('ProbeMin','National Day of Prayer',1,NULL,2995);

-- Everything a person needs to read, in one result. Postgres renders a
-- numeric as 30000.00 and a boolean as t, so both sides are levelled first.
CREATE OR REPLACE FUNCTION pg_temp.level(s text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(replace(COALESCE(s,''), '.00', ''), 'true', 't'), 'false', 'f')
$$;

SELECT CASE WHEN pg_temp.level(got) = pg_temp.level(want) THEN 'pass' ELSE 'FAIL' END AS r,
       label, got, want
  FROM probe_results
 ORDER BY (pg_temp.level(got) = pg_temp.level(want)), seq;

ROLLBACK;
