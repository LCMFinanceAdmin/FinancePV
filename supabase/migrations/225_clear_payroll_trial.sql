-- 225: clear the payroll trial, before the real records go in.
--
-- The Finance Executive is about to enter LCM's payroll properly, moving it
-- across from AutoCount. What is in these tables is what was left behind by
-- trying the feature out: one run for August 2026 containing a single line —
-- his own name — and ten casual worker worksheets from June and July.
--
-- Deleted here, with one exception noted at the end:
--
--   payroll_runs         1  August 2026, FINALIZED
--   payroll_lines        1  cascades from the run
--   payroll_vouchers     3  cascades from the run
--   payroll_audit_log   16  the record of the trial itself
--   worker_worksheets    9  of 10 — see below
--   pvs                  8  the vouchers those two produced
--
-- Employees and their salaries are deliberately untouched: 81 people and 83
-- salary records are the data being brought over, not the trial.
--
-- The vouchers go with them. A payroll run deleted on its own would leave
-- LCM-2026-018, 019 and 020 sitting in the finance queue asking to be
-- approved for a payroll that no longer exists, which is worse than either
-- keeping both or deleting both.
--
-- Every foreign key onto these rows is CASCADE or SET NULL — checked before
-- writing this — so nothing is orphaned and nothing blocks.

-- ── The August run, and the three vouchers it raised ───────────────────────
DELETE FROM payroll_runs;   -- lines, vouchers and custom defs cascade

DELETE FROM pvs
 WHERE pv_no IN ('LCM-2026-018', 'LCM-2026-019', 'LCM-2026-020');

-- ── The casual worker worksheets, except one ───────────────────────────────
-- WS-2026-004 stays, and so does BAM-2026-003, because that voucher is PAID:
-- RM 200 recorded as having actually gone to Chua Chee Onn. Clearing a trial
-- is one thing; deleting the record of money that left the account is another,
-- and it is not a thing to do as part of a tidy-up. If the church wants it
-- gone it should go deliberately, and this comment should be what makes that
-- a decision rather than an accident.
DELETE FROM worker_worksheets WHERE worksheet_no <> 'WS-2026-004';

DELETE FROM pvs
 WHERE pv_no IN ('BAM-2026-001', 'BAM-2026-005', 'BAM-2026-007',
                 'BAM-2026-008', 'BAM-2026-009');

-- ── The trail of the trial ─────────────────────────────────────────────────
DELETE FROM payroll_audit_log;
