-- 280: a custom allowance or deduction can be part of the gross.
--
-- These were built for money that sits outside the salary — COLA was the case
-- that shaped them, and COLA is deliberately not subject to EPF, SOCSO or PCB.
-- So they were applied after the statutory formulas, never fed into them.
--
-- That is right for COLA and wrong for what is actually being keyed. "Salary
-- Difference from 2024 and 2025", RM 870 a month from January, is salary. It
-- is late, not different. Paid outside the gross it escapes EPF on both sides,
-- escapes SOCSO and EIS, and is not declared for PCB — on a figure the church
-- owes as wages, which is a shortfall against three statutory boards rather
-- than a presentation choice.
--
-- So the item says which it is. Default false, because that is what every
-- existing row means: they were all keyed under the old rule, and a column
-- that silently reinterpreted them would move EPF on people already paid.
--
-- An in-gross item moves the gross BEFORE the contributions are worked out —
-- an allowance up, a deduction down — so every statutory figure follows it.
-- It is then not added again afterwards, which is the one thing that would
-- make this arithmetic wrong in a way nobody would spot: the figure would be
-- right on the sheet and the net would be out by exactly the item.

ALTER TABLE payroll_employee_custom_items
  ADD COLUMN IF NOT EXISTS in_gross BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN payroll_employee_custom_items.in_gross IS
  'True where this item is part of the gross and therefore subject to EPF, '
  'SOCSO, EIS and PCB — back pay, a salary difference, an arrears payment. '
  'False (the default) for money paid outside the salary, such as COLA. '
  'An in-gross item moves the gross before the contributions are computed '
  'and is not added again after them.';
