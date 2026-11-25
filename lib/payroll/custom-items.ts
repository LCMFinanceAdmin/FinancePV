// Which standing allowances and deductions a given month pays, and in what
// shape the calculator wants them.
//
// This rule was written out three times — the yearly sheet, the Edit Employee
// modal and the payroll run — and the three copies had already drifted: the
// run's own one selected the columns it needed and left `in_gross` out of
// them, so an item marked as part of the salary was quietly paid outside the
// gross in every run, escaping EPF, SOCSO, EIS and PCB. The sheet showed it
// correctly at the same time. That is the kind of disagreement nobody finds by
// reading, because each file looks right on its own.
//
// So the rule lives here once, and so does the mapping into calcLine's shape,
// which is where the flag was lost.

/** The fields that decide which months an item covers. */
export interface ItemPeriod {
  year: number;
  month: number;
  is_recurring: boolean;
  recur_until_year: number | null;
  recur_until_month: number | null;
}

/**
 * Does this item apply to `targetMonth` of `targetYear`?
 *
 * A one-off applies to its own month and no other. A recurring one applies
 * from its first month onwards, to its last month if it has one — a null
 * `recur_until_year` meaning it runs until somebody stops it.
 */
export function itemAppliesToMonth(
  item: ItemPeriod, targetYear: number, targetMonth: number,
): boolean {
  if (!item.is_recurring) return item.year === targetYear && item.month === targetMonth;
  const started = item.year < targetYear
    || (item.year === targetYear && item.month <= targetMonth);
  if (!started) return false;
  if (item.recur_until_year === null || item.recur_until_year === undefined) return true;
  return item.recur_until_year > targetYear
    || (item.recur_until_year === targetYear && (item.recur_until_month ?? 13) >= targetMonth);
}

/**
 * The months whose standing items a run of `month` pays.
 *
 * Itself, except for a 13th month: that is paid on December's salary, so it is
 * paid on December's standing items — those of them that earn a thirteenth
 * payment, which `thirteenthMonthItems` decides. Month 13 is in the list as
 * well, for anything keyed directly to the bonus.
 *
 * An item that ends in December therefore drops out of the following year's
 * bonus by itself, with no second end date to keep in step.
 */
export function itemMonthsForRun(month: number): readonly number[] {
  return month === 13 ? [12, 13] : [month];
}

/**
 * The items a run of `month` pays, each counted ONCE.
 *
 * The counting is the point. A 13th month draws on two months — December,
 * whose salary it is paid on, and the 13th itself — and an item can belong to
 * both: a standing allowance running "until the 13th month" matches December
 * and the 13th. Taking the two months' lists and joining them paid such an
 * item twice, which is exactly what happened: RM 870 of outstanding salary
 * became RM 1,740 of it in the bonus, and the gross with it.
 *
 * So the selection is a filter over every item rather than a join of per-month
 * lists, and `.some` collapses the two months to one hit. The yearly sheet and
 * the payroll run both call this, because they must agree about a figure
 * somebody is paid.
 */
export function itemsForRun<T extends ItemPeriod>(
  items: readonly T[], year: number, month: number,
): T[] {
  const months = itemMonthsForRun(month);
  return items.filter(i => months.some(m => itemAppliesToMonth(i, year, m)));
}

/** Every month of `year` an item is paid in, the 13th included. */
export function monthsCovered(item: ItemPeriod, year: number): number[] {
  return Array.from({ length: 13 }, (_, i) => i + 1)
    .filter(m => itemMonthsForRun(m).some(t => itemAppliesToMonth(item, year, t)));
}

/**
 * An item row as calcLine takes it.
 *
 * Both flags, always. They are the two separate questions an item answers —
 * is this part of the wage, and does it earn a thirteenth payment — and a
 * mapping that drops one silently changes what is owed.
 */
export function toCalcItem(c: {
  label: string;
  type: "allowance" | "deduction";
  amount: number;
  /** The database column, on an item row. */
  in_gross?: boolean;
  in_thirteenth?: boolean;
  /** What a finalised run stored on its line. */
  inGross?: boolean;
  inThirteenth?: boolean;
}): {
  label: string;
  type: "allowance" | "deduction";
  amount: number;
  inGross: boolean;
  inThirteenth: boolean;
} {
  return {
    label: c.label,
    type: c.type,
    amount: Number(c.amount),
    inGross: !!(c.in_gross ?? c.inGross),
    inThirteenth: !!(c.in_thirteenth ?? c.inThirteenth),
  };
}
