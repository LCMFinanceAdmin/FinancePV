-- 234: the Ref on a voucher is the office's to write, not the system's.
--
-- The "FOR OFFICE USE ONLY" box has always printed office_ref, falling back to
-- pv_no when nobody had set one — and nobody ever had, on any of the 28
-- vouchers raised so far. So the box has only ever shown the number this
-- system allocated to itself.
--
-- That number is not the number the church files under. Finance is moving its
-- own ledger onto this system and needs the printed reference to follow the
-- sequence their books already use, which means typing it rather than being
-- handed one. The fallback goes, and the box shows what was entered.
--
-- pv_no stays exactly as it is: it is the primary key, it is what every
-- notification, queue and link refers to, and it is how support finds a
-- voucher. It simply stops being what the voucher prints as its reference.
--
-- The backfill is not cosmetic. Two of these vouchers are paid and have been
-- printed and filed with the number in that box; a reprint that came back
-- blank would contradict a document already in a file. Every existing voucher
-- therefore keeps the reference it has been showing, and Finance can correct
-- any of them by hand. Only vouchers raised from now on start empty.

UPDATE pvs
   SET office_ref = pv_no
 WHERE COALESCE(NULLIF(TRIM(office_ref), ''), '') = '';

COMMENT ON COLUMN pvs.office_ref IS
  'The reference printed in the FOR OFFICE USE ONLY box, entered by Finance. '
  'Empty on a new voucher: it follows the church''s own filing sequence, not '
  'this system''s. pv_no remains the internal key and is not printed here.';
