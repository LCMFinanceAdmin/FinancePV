// What a loan instalment leaves of somebody's salary.
//
// Invented salaries. The point of the warning is the approver: more than one
// loan may run at once from November 2026, nothing caps the instalments
// against the wage they come from, and the person who should see that before
// it happens is the one approving the second.
import test from "node:test";
import assert from "node:assert/strict";
import { affordabilityOf } from "@/lib/payroll/loan-affordability";
import type { EmployeeLoan, PayrollEmployee, PayrollSalary } from "@/lib/types";

const emp = (o: Partial<PayrollEmployee> = {}) => ({
  id: "E1", dob: "1985-01-01", employment_type: "PERMANENT", is_orang_asli: false,
  epf_voluntary_ee_amount: 0, skbbk_opted_out: false, epf_over60_contributing: false,
  fixed_pcb: null, ...o,
} as PayrollEmployee);

const salary = (base: number) => ({
  base_salary: base, increment_carried: 0, increment_current: 0,
  experience_bonus: 0, family_allowance: 0, stm_allowance: 0,
} as PayrollSalary);

const loan = (id: string, monthly: number) => ({
  id, loan_no: `EPL-${id}`, monthly_installment: monthly, status: "ACTIVE",
} as EmployeeLoan);

const at = (base: number, thisLoan: number, others: EmployeeLoan[] = []) =>
  affordabilityOf(loan("L1", thisLoan), emp(), salary(base), others, undefined, [], 2026, 11);

test("a modest loan on a decent salary leaves most of it", () => {
  const a = at(3450, 280)!;
  assert.ok(a.netBeforeLoans > 2900, "take-home before the loan");
  assert.equal(a.totalMonthly, 280);
  assert.ok(a.leftOver > 2600);
  assert.ok(a.share < 0.5, "not a tight month");
});

test("the loans already running are counted in, not just this one", () => {
  const a = at(3450, 280, [loan("A", 250), loan("B", 200)])!;
  assert.equal(a.otherMonthly, 450);
  assert.equal(a.thisMonthly, 280);
  assert.equal(a.totalMonthly, 730);
  assert.equal(a.leftOver, Math.round((a.netBeforeLoans - 730) * 100) / 100);
});

test("instalments beyond the salary come out negative, not clamped", () => {
  // Three loans against a small wage. The approver has to see that it does
  // not fit, so the figure is allowed to go below nothing.
  const a = at(1200, 400, [loan("A", 400), loan("B", 400)])!;
  assert.equal(a.totalMonthly, 1200);
  assert.ok(a.leftOver < 0, `expected a shortfall, got ${a.leftOver}`);
  assert.ok(a.share > 1);
});

test("exactly nothing left is still not a shortfall", () => {
  const base = at(3450, 0)!;
  const a = at(3450, base.netBeforeLoans)!;
  assert.equal(a.leftOver, 0);
  assert.ok(a.share >= 1);
});

test("a standing PCB lowers what there is to take the loan from", () => {
  const without = affordabilityOf(loan("L1", 280), emp(), salary(3450), [], undefined, [], 2026, 11)!;
  const withPcb = affordabilityOf(loan("L1", 280), emp({ fixed_pcb: 150 }), salary(3450), [], undefined, [], 2026, 11)!;
  assert.equal(Math.round((without.netBeforeLoans - withPcb.netBeforeLoans) * 100) / 100, 150);
  assert.ok(withPcb.leftOver < without.leftOver);
});

test("no salary on record means no claim about what is left", () => {
  assert.equal(affordabilityOf(loan("L1", 280), emp(), null, [], undefined, [], 2026, 11), null);
  assert.equal(affordabilityOf(loan("L1", 280), emp(), salary(0), [], undefined, [], 2026, 11), null);
});

test("an over-60 keeps more of the gross, so the same loan bites less", () => {
  // No employee EPF, no employee SOCSO, no EIS from the month they turn 60.
  const under = affordabilityOf(loan("L1", 280), emp({ dob: "1985-01-01" }), salary(3450), [], undefined, [], 2026, 11)!;
  const over = affordabilityOf(loan("L1", 280), emp({ dob: "1960-01-01" }), salary(3450), [], undefined, [], 2026, 11)!;
  assert.ok(over.netBeforeLoans > under.netBeforeLoans);
  assert.ok(over.leftOver > under.leftOver);
});
