-- 238: the Building Manager records income too.
--
-- The Income page offers the "add" button to Finance and the Building Manager
-- alike — he takes the facility rentals — and 236 left income_records to
-- Finance alone. He would have pressed save and been told nothing, because a
-- policy that refuses says nothing at all.
--
-- Third of this kind, and the pattern is the same each time: the table name
-- says "money", the page says who actually writes it, and only the page is
-- right. Checked the remaining money tables the same way — recurring,
-- bank accounts, bank statements, fixed deposits, budget items, bulk runs and
-- employee documents are all reached by Finance alone.

DROP POLICY IF EXISTS income_records_insert ON income_records;
DROP POLICY IF EXISTS income_records_update ON income_records;
DROP POLICY IF EXISTS income_records_delete ON income_records;

CREATE POLICY income_records_insert ON income_records FOR INSERT
  WITH CHECK (can_write_money() OR is_building_manager());
CREATE POLICY income_records_update ON income_records FOR UPDATE
  USING (can_write_money() OR is_building_manager())
  WITH CHECK (can_write_money() OR is_building_manager());
CREATE POLICY income_records_delete ON income_records FOR DELETE
  USING (can_write_money() OR is_building_manager());
