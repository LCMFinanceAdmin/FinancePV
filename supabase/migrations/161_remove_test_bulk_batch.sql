-- 161: remove the test batch created by migration 160.
--
-- Run this when you have finished looking at the grouped cards. Written at the
-- same time as 160 rather than later, because test data with no removal step
-- beside it is test data that becomes permanent.
--
-- Matched on the TEST- voucher prefix and the TEST group names, both of which
-- 160 set deliberately. Nothing real carries either.
DELETE FROM bulk_pv_runs
 WHERE group_name IN (
   'TEST — Social Concern assistance',
   'TEST — Education grants',
   'MASTER: TEST — September disbursement'
 );

DELETE FROM pvs WHERE pv_no LIKE 'TEST-B-%';

SELECT
  (SELECT count(*) FROM pvs WHERE pv_no LIKE 'TEST-B-%')                AS test_pvs_left,
  (SELECT count(*) FROM bulk_pv_runs WHERE group_name LIKE '%TEST —%')  AS test_batches_left;
