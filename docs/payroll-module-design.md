# Payroll Module — Design Document

> Status: **Draft for approval** (no code written yet). Built per the "full design first" decision.
> Decisions locked: full design first · **hybrid** statutory calc (auto EPF/SOCSO/EIS, manual PCB) ·
> payroll **generates monthly PVs** into the existing approval+payment pipeline ·
> access for **Finance Executive, Accounts Executive, GM**.

---

## 1. Goal

Track salary and statutory data for 80+ LCM employees, one **yearly sheet per employee** (mirroring
`TAN EE YAN (2025)-1.xlsx`), with automatic EPF/SOCSO/EIS calculation, manual PCB entry, increment
timing rules, pastor experience bonus, employee loans (EPL) with repayment schedules, and a 13th-month
run. Each monthly payroll run generates bulk PVs in the existing system for approval and payment.

---

## 2. The yearly sheet — decoded from your Excel

Confirmed against TAN EE YAN's numbers and cell formulas:

| Col | Field | Rule |
|-----|-------|------|
| A | Month (Jan–Dec) | 12 rows + a 13th-month row + annual total |
| B | Total increment since prior years | carried forward |
| C | Increment this year | per increment policy / management |
| D | Increment to-date | `B + C` |
| E | Experience (5-yr max) | pastor seniority bonus, capped |
| F | Total additions | `D + E` |
| G | Base salary | the agreed basic |
| H | STM / allowance | secondment / fixed allowance |
| I | **Gross salary** | `F + G + H` |
| J | I/TAX (PCB) | **manual entry** (hybrid) |
| K/L/M | EPF EE / ER / Total | EE & ER % per employee config; `M = K + L` |
| N/O/P | EIS EE / ER / Total | 0.2% each, wage-ceiling capped; `P = N + O` |
| Q/R/S | SOCSO EE / ER / Total | EE 0.5% / ER 1.75%, age-banded; `S = Q + R` |
| T/U/V | Total contribution EE / ER / Total | `T = K+N+Q`, `U = L+O+R`, `V = T+U` |
| W | EPL deduction | loan repayment for the month |
| X | **Net salary** | `I − J − T − W` |
| Y | **Total LCM payment** | `I + U` (gross + employer contributions) |

**Summary rows:** Sub-total(12) = sum Jan–Dec · **13th month** (carries EPF + PCB, **no SOCSO/EIS** —
N/O/Q/R = 0) · Annual total = Sub-total + 13th month.

**Header master data:** Name, I/C No, DOB // Age, Date of commencement // years of service, Marital
status, Designation, "Revised" note (EPF rate basis, e.g. "EPF 13% + 3%"), employer tax ref.
**Footer:** Reviewed & concurred by / Name / Date.

---

## 3. Data model (new tables)

### `payroll_employees`
Master record per employee.
- `id`, `full_name`, `ic_no`, `dob`, `designation`
- `employment_type` (`PERMANENT` | `CONTRACT`)
- `is_pastor` (bool), `prior_experience_years` (for the 5-yr-max bonus)
- `is_orang_asli` (bool — drives a separate EPF/SOCSO rate category)
- `date_commenced` (drives increment timing & years of service)
- **Posting / placement** (for the header): `posting_type` (`CHURCH` | `OFFICE` | `OTHER`)
  - if `CHURCH` → `church_name`
  - if `OFFICE` → `department` + `designation`
- **LHDN / tax-relief fields** (inform PCB, which is manual):
  - `marital_status`, `spouse_working` (bool), `children_under_18` (int), `children_in_college` (int)
- `epf_voluntary_ee_amount` (optional **fixed RM** voluntary EE contribution; differs per employee)
- `revised_note` (free text, e.g. "1 JAN 2013 (EPF 13% + 3%)")
- `employer_tax_ref`, `status` (`ACTIVE` | `RESIGNED`), `resigned_date`
- `bank_name`, `bank_acct` (for PV payee generation)

> EPF EE/ER rates are **not stored as fixed fields** — they are resolved at calc time from
> employment_type + age + orang_asli + voluntary extra (see §4). The `revised_note` is display-only.

### `payroll_salary` (agreed salary components, versioned — full history)
- `employee_id`, `effective_from`, `created_at` (**timestamp of each revision**), `created_by`, `reason`
- `base_salary`, `stm_allowance`, `experience_bonus` (capped 5-yr), `increment_carried`, `increment_current`
- A new row each time something changes (increment, policy change, resignation) → full history.
- The yearly sheet shows the **revision history** with the timestamp of each change and a
  **difference analysis** (what changed vs the previous version, and the RM/% delta per component).

### `payroll_statutory_rates` (admin-editable, per year — the "tables" half of hybrid)
- `year`, `kind` (`EPF` | `SOCSO` | `EIS`)
- EPF: age-band → EE%/ER% defaults; SOCSO/EIS: wage ceiling + EE%/ER% by age category.
- Lets Finance update rates when the government changes policy without code changes.

### `payroll_runs`
One per month (and a 13th-month run).
- `id`, `year`, `month` (1–12, or `13`), `status` (`DRAFT` | `PV_GENERATED` | `PAID`)
- `generated_by`, `pv_bulk_run_id` (link to the bulk PV created), `created_at`

### `payroll_lines`
One per employee per run — a snapshot of that month's computed sheet row (all columns A–Y above).
This is what the yearly sheet reads back, and what feeds the PV.

### `employee_loans` (EPL)
- `id`, `employee_id`, `loan_no`, `principal`, `monthly_installment`, `term_months`
- `start_month` (when repayment begins), `status` (`PENDING` | `APPROVED` | `ACTIVE` | `SETTLED` | `REJECTED`)
- `approvals` (JSONB, same pattern as PVs), `agreement_url`

### `loan_repayments`
- `loan_id`, `payroll_run_id`, `month`, `amount`, `balance_after` — drives column W and shows outstanding.

---

## 4. Calculation engine

For each employee in a run:
1. **Gross** = (increment_carried + increment_current) + experience_bonus + base_salary + stm_allowance.
2. **EPF** (auto) — rate resolver:

   | Category | EE | ER |
   |----------|----|----|
   | Full-time, **under 60**, not Orang Asli | **11%** (+ optional voluntary) | **13% govt + 3% LCM = 16%** |
   | **60+** or **contract**, not Orang Asli | **0%** (unless voluntary) | **4% govt + 3% LCM = 7%** |
   | **Orang Asli** ministry | **11%** | **13%** (no +3% LCM) |

   EE = round(gross × resolved_ee_rate) + **voluntary fixed amount** (per-employee RM, differs per person);
   ER = round(gross × resolved_er_rate).
3. **SOCSO** (auto): from `payroll_statutory_rates` by wage ceiling + age category (age 60+ → employer-only
   category). Matches your 0.5% / 1.75%.
4. **EIS** (auto): 0.2% EE + 0.2% ER, capped at wage ceiling; **zero once age ≥ 60**.
5. **PCB** (manual): Finance keys the figure (hybrid). The LHDN fields (spouse working, children under 18 /
   in college) are surfaced on the sheet to help compute reliefs. Stored per line; editable.
6. **EPL deduction**: this month's installment from any `ACTIVE` loan.
7. **Net** = Gross − PCB − EE-contributions − EPL. **Total LCM payment** = Gross + ER-contributions.
8. **13th month**: paid **mid-December**, same gross basis, **EPF + PCB only**, SOCSO/EIS = 0.
   **Orang Asli ministry staff are excluded** from the 13th-month run.

**Payment timing:** salaries are paid at the **beginning of the month**, so a run for month *M* is
prepared and its PVs approved **before** month *M* starts (i.e. generated late in month *M−1*). Run
scheduling and the PV due-dates reflect this. The 13th-month run is a separate mid-December run.

**Increment timing engine** (annual roll-forward):
- Joined **before July** → that year's increment takes effect **Jan of the following year**.
- Joined **after July** → increment takes effect **Jul of the following year**.
- "Beyond policy" increments are entered manually by management and flagged.

**Pastor experience bonus:** if `is_pastor` and `prior_experience_years ≥ 5`, add the configured extra to
base, capped at the 5-year maximum (your column E).

---

## 5. EPL — loan application workflow

Mirrors the PV approval pattern:
1. Application created (amount, term, monthly installment, start month, agreement attachment).
2. Routed for approval (GM / management) — reuses the approval + PIN + notification machinery.
3. On approval → `ACTIVE`; a repayment schedule is generated.
4. Each payroll run pulls the due installment into column W and decrements the balance until `SETTLED`.

---

## 6. PV generation (monthly integration)

When a run is finalised it generates PVs into the existing approval → signatory → payment pipeline,
grouped under one **Master** for the month:

1. **Salary PV (one consolidated PV)** — lists **all employees**, each row showing Gross, EPF, SOCSO,
   EIS, PCB (employee & employer portions) and **Net Salary** as the final payable figure. Net total =
   the amount paid out to staff.
2. **Statutory PVs (one consolidated PV per contribution type)** — separate PVs for **EPF, SOCSO, EIS,
   PCB**, each listing all employees with their employee portion, employer portion, and the **total of
   the two**. (Separate because each is remitted to a different body — KWSP / PERKESO / LHDN.)

So a monthly run produces 1 salary PV + 4 statutory PVs (EPF, SOCSO, EIS, PCB — SOCSO & EIS kept
separate), bundled under a **Master voucher** for the month. The run links to its `bulk_run_id`; status
follows the batch through to PAID, and the Master flows through the same Active → History tracking built
on the recurring page.

**Run creation & reminder:** runs are created **manually**. A scheduled reminder fires on the **18th of
each month** — if no run exists yet for the upcoming month, the system sends a notification/push (reusing
the existing notifications + push infrastructure) prompting Finance to create it. (Salaries pay at the
start of the month, so the 18th gives lead time to prepare and get approvals before month-end.)

---

## 7. Roles & access

Add a new **`ACCOUNTS_EXECUTIVE`** role (does not exist today — only `FINANCE_ADMIN` /
Finance Executive does). Payroll module visible to **Finance Executive, Accounts Executive, GM**.
Finance & Accounts edit; GM read-only oversight + loan approvals.

---

## 8. Pages / UI

- **/payroll** — employee directory (search 80+), status, designation, current salary, quick links.
- **/payroll/[id]** — the **yearly sheet** for an employee/year (the Excel layout, read + edit), year switcher.
- **/payroll/runs** — monthly run list; create/preview a run, see computed lines, finalise → generate PVs.
- **/payroll/loans** — EPL applications + active loans + repayment schedules.
- **/payroll/rates** — admin-editable statutory rate tables per year.
- Export each yearly sheet to Excel/PDF in your exact format.

---

## 9. Build order (phases within the full design)

1. Schema + `payroll_employees` + employee directory + yearly-sheet **display**.
2. Salary components + calculation engine (EPF/SOCSO/EIS auto, PCB manual) + 13th month.
3. Statutory rate tables + increment timing engine + pastor bonus.
4. EPL loans (application → approval → repayment schedule → column W).
5. Monthly run → bulk PV generation + status tracking.
6. Excel/PDF export in your format; rate-change & resignation handling polish.

---

## 10. Decisions (resolved) & remaining confirmations

**Resolved:**
1. ✅ **Salary PV** — one consolidated PV listing all employees with Gross/EPF/SOCSO/EIS/PCB (EE+ER) and Net.
2. ✅ **Statutory PVs** — one consolidated PV **per contribution type** (EPF, SOCSO, EIS, PCB), each listing
   all employees with EE / ER / total.
3. ✅ **EPF rates** — resolved by employment type + age + Orang Asli + voluntary (table in §4).
4. ✅ **13th month** — mid-December, EPF + PCB only. Salaries paid at the **start** of each month.
5. ✅ **EPL approval** — GM + a signatory, same as PVs.
6. ✅ **Start fresh** from a chosen month (no bulk historical import).
7. ✅ **Header additions** — marital status, spouse working, children <18, children in college, posting
   (church / office+department), salary-revision timestamps + history + difference analysis.

8. ✅ **Orang Asli** — EPF EE 11% / ER 13% (no +3%); **excluded from 13th month**.
9. ✅ **SOCSO & EIS PVs kept separate** (mirrors the sheet's separate columns).
10. ✅ **Manual run creation** + **reminder on the 18th** of each month if not yet created.
11. ✅ **Voluntary EPF** = fixed RM amount per employee (varies per person).

**All decisions resolved — design is ready to build on approval.**
