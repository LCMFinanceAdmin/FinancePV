-- 092: Let a PV cite an earlier one.
--
-- When a voucher corrects, tops up, reverses or otherwise follows from an
-- earlier payment, the GM and signatories need to see that context at the point
-- of approving — otherwise the second PV looks like a duplicate or an unexplained
-- payment, and the connection lives only in someone's memory.
--
-- The number is stored alongside the id on purpose. The id gives a working link;
-- the number is what the printed voucher and the audit file quote, and it must
-- still read correctly years later even if the referenced row is ever removed.

ALTER TABLE pvs
  ADD COLUMN IF NOT EXISTS reference_pv_id UUID REFERENCES pvs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reference_pv_no TEXT,
  ADD COLUMN IF NOT EXISTS reference_note  TEXT;

CREATE INDEX IF NOT EXISTS idx_pvs_reference ON pvs(reference_pv_id);
