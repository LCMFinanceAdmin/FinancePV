-- 160: a disposable Master → Bulk → PV batch, to look at the new card design.
--
-- Created on request so the grouped cards can be seen with real data — nothing
-- in the system had a bulk run in it, so the three-level layout had never
-- rendered outside a type-check.
--
-- Everything here is marked TEST in its name and its purpose, and carries the
-- TEST- voucher prefix, so it cannot be mistaken for a real payment on any
-- screen it appears on. Migration 161 removes it; run that when you are done
-- looking, and nothing is left behind.
--
-- Deliberately inserted directly rather than through the submit flow: that
-- route calls the submit-pv edge function, which notifies approvers. Nobody
-- should get a push notification about a voucher that exists to be looked at.

DO $$
DECLARE
  v_a1 UUID := gen_random_uuid();
  v_a2 UUID := gen_random_uuid();
  v_a3 UUID := gen_random_uuid();
  v_b1 UUID := gen_random_uuid();
  v_b2 UUID := gen_random_uuid();
  v_owner TEXT := 'finance@lcm.org.my';
BEGIN
  -- ── Batch A: three vouchers ───────────────────────────────────────────
  INSERT INTO pvs (id, pv_no, status, amount, payee_name, ministry, dept, purpose,
                   payment_type, loa_required, applicant_email, submitted_by_email,
                   submitted_at, date)
  VALUES
    (v_a1, 'TEST-B-001', 'PENDING_SIGNATORY', 1250.00, 'Sunway Medical Centre',
     'Social Concern', '', 'TEST DATA — Medical assistance, Ah Seng family',
     'GENERAL', 1, v_owner, v_owner, NOW(), CURRENT_DATE),
    (v_a2, 'TEST-B-002', 'PENDING_SIGNATORY', 480.00, 'Kedai Buku Kristian',
     'Social Concern', '', 'TEST DATA — Bibles and study material for outreach',
     'GENERAL', 1, v_owner, v_owner, NOW(), CURRENT_DATE),
    (v_a3, 'TEST-B-003', 'PENDING_SIGNATORY', 2310.50, 'Hospital Tuanku Jaafar',
     'Social Concern', '', 'TEST DATA — Dialysis support, September 2026',
     'GENERAL', 1, v_owner, v_owner, NOW(), CURRENT_DATE);

  -- ── Batch B: two vouchers ─────────────────────────────────────────────
  INSERT INTO pvs (id, pv_no, status, amount, payee_name, ministry, dept, purpose,
                   payment_type, loa_required, applicant_email, submitted_by_email,
                   submitted_at, date)
  VALUES
    (v_b1, 'TEST-B-004', 'PENDING_SIGNATORY', 3600.00, 'Grace Lutheran Kindergarten',
     'Education', '', 'TEST DATA — Teaching aid grant, Term 3',
     'GENERAL', 1, v_owner, v_owner, NOW(), CURRENT_DATE),
    (v_b2, 'TEST-B-005', 'PENDING_SIGNATORY', 890.00, 'Percetakan Nasional',
     'Education', '', 'TEST DATA — Sunday school workbooks',
     'GENERAL', 1, v_owner, v_owner, NOW(), CURRENT_DATE);

  -- ── The two batches ───────────────────────────────────────────────────
  INSERT INTO bulk_pv_runs (group_name, run_by, run_date, pv_ids, pv_nos,
                            total_amount, pv_count, ministry, is_master, pv_type)
  VALUES
    ('TEST — Social Concern assistance', v_owner, CURRENT_DATE,
     to_jsonb(ARRAY[v_a1, v_a2, v_a3]),
     to_jsonb(ARRAY['TEST-B-001','TEST-B-002','TEST-B-003']),
     4040.50, 3, 'Social Concern', FALSE, 'GENERAL'),
    ('TEST — Education grants', v_owner, CURRENT_DATE,
     to_jsonb(ARRAY[v_b1, v_b2]),
     to_jsonb(ARRAY['TEST-B-004','TEST-B-005']),
     4490.00, 2, 'Education', FALSE, 'GENERAL');

  -- ── The master over both ──────────────────────────────────────────────
  -- child_group_names is what the pages match on to nest a batch under a
  -- master, so these must be the batch names exactly.
  INSERT INTO bulk_pv_runs (group_name, master_name, run_by, run_date, pv_ids, pv_nos,
                            total_amount, pv_count, ministry, is_master,
                            child_group_names, pv_type)
  VALUES
    ('MASTER: TEST — September disbursement', 'TEST — September disbursement',
     v_owner, CURRENT_DATE,
     to_jsonb(ARRAY[v_a1, v_a2, v_a3, v_b1, v_b2]),
     to_jsonb(ARRAY['TEST-B-001','TEST-B-002','TEST-B-003','TEST-B-004','TEST-B-005']),
     8530.50, 5, NULL, TRUE,
     ARRAY['TEST — Social Concern assistance','TEST — Education grants'], 'GENERAL');
END $$;

SELECT group_name, is_master, pv_count, total_amount FROM bulk_pv_runs
 WHERE group_name LIKE '%TEST —%' ORDER BY is_master DESC, group_name;
