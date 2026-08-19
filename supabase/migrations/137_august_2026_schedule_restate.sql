-- 137: restate August 2026 onto PERKESO's schedule.
--
-- A data correction, not a schema change, kept here so the reasoning survives
-- with it. It follows 134, which put SKBBK into this run when 133 first set the
-- rate. Both figures came from the straight-percentage method, and 135 replaced
-- that with PERKESO's own contribution schedule — so this run is now the only
-- place in the system still holding the old arithmetic.
--
-- It matters because none of the three vouchers has been paid. The PERKESO
-- summary is generated from these lines, and PERKESO reconcile what they are
-- sent against their own schedule. Remitting 236.31 where their table says
-- 238.00 is a shortfall on their side of the ledger, small as it is.
--
-- Most of the difference is not rounding. The schedule computes from the band's
-- MIDPOINT, not the wage: a 2,710 salary sits in the band (2,700, 2,800] and
-- every figure derives from 2,750.
--
-- EPF is untouched. It follows KWSP's own schedule, which this never changed.
--
-- Driven off payroll_contribution_bands rather than written out, so it cannot
-- disagree with what the app computes for the same month. Restricted to lines
-- with an employee SOCSO share, which is the under-60 category these bands
-- describe; a 60+ line would need the injury-only column and there is none in
-- this run. Idempotent — the second run finds nothing left to change.

BEGIN;

CREATE TEMP TABLE aug_restate ON COMMIT DROP AS
SELECT l.id, l.employee_name,
       l.socso_ee, l.socso_er, l.eis_ee, l.eis_er, l.skbbk, l.net, l.total_lcm,
       b.socso_ee AS t_socso_ee,
       b.socso_er AS t_socso_er,
       b.eis      AS t_eis,
       b.skbbk    AS t_skbbk
FROM payroll_lines l
JOIN payroll_runs r ON r.id = l.run_id
JOIN payroll_contribution_bands b
  ON b.year = r.year
 AND l.gross > b.wage_from
 AND (b.wage_to IS NULL OR l.gross <= b.wage_to)
WHERE r.year = 2026
  AND r.month = 8
  AND l.socso_ee > 0                      -- under-60 category
  AND ( l.socso_ee <> b.socso_ee OR l.socso_er <> b.socso_er
     OR l.eis_ee   <> b.eis      OR l.eis_er   <> b.eis
     OR l.skbbk    <> b.skbbk );

-- Net and total_lcm move by the delta rather than being recomputed, so whatever
-- else the line carries — PCB, EPL, custom items, adjustments — survives
-- untouched. Only the figures that actually changed move.
UPDATE payroll_lines l
   SET socso_ee  = a.t_socso_ee,
       socso_er  = a.t_socso_er,
       eis_ee    = a.t_eis,
       eis_er    = a.t_eis,
       skbbk     = a.t_skbbk,
       net       = l.net - ((a.t_socso_ee - a.socso_ee)
                          + (a.t_eis      - a.eis_ee)
                          + (a.t_skbbk    - a.skbbk)),
       total_lcm = l.total_lcm + ((a.t_socso_er - a.socso_er)
                                + (a.t_eis      - a.eis_er))
  FROM aug_restate a
 WHERE l.id = a.id;

-- The vouchers are generated from the lines, so they follow. EPF is left alone.
UPDATE payroll_vouchers v
   SET total_amount = t.amt
  FROM (
    SELECT r.id AS run_id,
           sum(l.socso_ee + l.socso_er + l.eis_ee + l.eis_er + l.skbbk) AS amt
      FROM payroll_lines l JOIN payroll_runs r ON r.id = l.run_id
     WHERE r.year = 2026 AND r.month = 8
     GROUP BY r.id
  ) t
 WHERE v.run_id = t.run_id AND v.kind = 'PERKESO' AND v.status <> 'PAID';

UPDATE payroll_vouchers v
   SET total_amount = t.amt
  FROM (
    SELECT r.id AS run_id, sum(l.net) AS amt
      FROM payroll_lines l JOIN payroll_runs r ON r.id = l.run_id
     WHERE r.year = 2026 AND r.month = 8
     GROUP BY r.id
  ) t
 WHERE v.run_id = t.run_id AND v.kind = 'SALARY' AND v.status <> 'PAID';

-- And the run's own headline totals.
UPDATE payroll_runs r
   SET total_net      = t.net,
       total_employer = t.employer,
       total_lcm      = t.lcm
  FROM (
    SELECT l.run_id,
           sum(l.net) AS net,
           sum(l.epf_er + l.socso_er + l.eis_er) AS employer,
           sum(l.total_lcm) AS lcm
      FROM payroll_lines l
     GROUP BY l.run_id
  ) t
 WHERE r.id = t.run_id AND r.year = 2026 AND r.month = 8;

-- The row cannot explain itself later, so the trail says what moved and why.
INSERT INTO payroll_audit_log (action, entity, employee_id, detail, actor)
SELECT 'LINE_CORRECTED', a.employee_name, l.employee_id,
       format('Aug 2026 restated onto the PERKESO schedule (migration 137): SOCSO EE %s->%s, SOCSO ER %s->%s, EIS %s->%s each side, SKBBK %s->%s. Band midpoint, not the wage.',
              a.socso_ee, a.t_socso_ee, a.socso_er, a.t_socso_er,
              a.eis_ee, a.t_eis, a.skbbk, a.t_skbbk),
       'migration 137'
  FROM aug_restate a JOIN payroll_lines l ON l.id = a.id;

COMMIT;
