export type UserRole =
  | "FINANCE_ADMIN"
  | "GENERAL_MANAGER"
  | "BISHOP"
  | "TREASURER"
  | "SECRETARY"
  | "MINISTRY_HEAD"
  | "BUILDING_MANAGER"
  | "BAM_COMMITTEE"
  | "STAFF";

export type PVStatus =
  | "PENDING_HEAD"
  | "PENDING"
  | "REVIEWED"
  | "MINISTRY_VERIFIED"
  | "PENDING_SIGNATORY"
  | "APPROVED"
  | "PAID"
  | "REJECTED"
  | "REJECTED_HEAD"
  | "CANCELLED"
  // BAM PV statuses
  | "BAM_COMMITTEE_REVIEW" // waiting for BAM Committee PIC verification (BM-created PVs)
  | "BAM_REVIEW"      // waiting for Building Manager review
  | "FINANCE_REVIEW"  // waiting for Finance Executive review
  | "GM_REVIEW";      // waiting for General Manager approval

export type PVType = "LCM" | "BAM";

export type PaymentType = "GENERAL" | "ASSET_PURCHASE";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  ministries: string[];
  isFinanceAdmin: boolean;
  /**
   * The Accounts Executive (FINANCE_ADMIN_2). She sits inside isFinanceAdmin —
   * she reaches the same finance pages — but she does not decide vouchers. She
   * records payments and keeps the reference series, runs payroll, and keeps
   * the church records. Read this wherever a page offers approve, reject or
   * verify, and hide those.
   */
  isAccountsExec?: boolean;
  isSignatory: boolean;
  signatoryRole: string;
  isMinistryHead: boolean;
  /**
   * Verifies for an EXCO member who asked them to, without holding a portfolio.
   * Deliberately not folded into isMinistryHead: that flag also *withholds*
   * things (My PVs is hidden from committee members, who see their vouchers in
   * the EXCO queue instead), and a delegate is usually ordinary staff who still
   * submits their own.
   */
  isMinistryVerifier?: boolean;
  /**
   * A Ministry Desk — appointed by an EXCO member to run a desk.
   *
   * Deliberately NOT folded into isMinistryHead: a desk holds no portfolio and
   * ranks below the EXCO who appointed it. What it may verify comes entirely
   * from ministry_verifiers, which is what isMinistryVerifier reflects.
   */
  isMinistrySupport?: boolean;
  isGeneralManager: boolean;
  isBuildingManager: boolean;
  isBamCommittee?: boolean;
  isAdministrator?: boolean;
  isTestAdmin: boolean;
  // Church directory. Position and employment sit alongside the system role
  // above rather than replacing it: an EXCO member who is also a pastor is
  // MINISTRY_HEAD with isPastor true, and keeps every EXCO permission.
  // Optional because several pages build a profile inline from user_roles
  // without the directory join. Treat an absent isLcmStaff as employed (see
  // isStaffMember below) so nothing is locked out before the directory is
  // filled in; absent isPastor/isDean simply grant nothing extra.
  isLcmStaff?: boolean;  // employed by LCM — gates leave, staff loans, payroll
  isPastor?: boolean;
  isDean?: boolean;      // derived: leads a district
  congregation?: string;
  district?: string;
  designation?: string;
  /**
   * A test identity rather than a person.
   *
   * Grants and withholds nothing — a test account holds a real role with the
   * real permissions attached to it, which is the entire point of having one.
   * All this drives is the banner, so a session that can clear a real voucher
   * can never be mistaken for an ordinary one.
   */
  isTestAccount?: boolean;
}

/**
 * Whether someone is employed by LCM, for gating leave, staff loans and
 * payroll. Absent means "not yet recorded", which must read as employed — the
 * directory is populated gradually and nobody should lose access meanwhile.
 * Only an explicit false locks a feature.
 */
export function isStaffMember(u: Pick<UserProfile, "isLcmStaff">): boolean {
  return u.isLcmStaff !== false;
}

export interface PV {
  id: string;
  pv_no: string;
  status: PVStatus;
  dept: string;
  payment_type: PaymentType;
  payee_name: string;
  payee_bank: string;
  payee_bank_name: string;
  payee_bank_acct: string;
  payee_account: string;
  amount: number;
  ministry: string;
  project: string;
  purpose: string;
  line_items: PVLineItem[];
  attachments: string[];
  submitted_by: string;
  submitted_by_email: string;
  submitted_by_role: string | null;
  submitted_at: string;
  date: string;
  applicant_name: string;
  applicant_email: string;
  approvals: PVApproval[];
  loa_required: number;
  loa_label: string;
  paid_at: string | null;
  paid_by: string | null;
  payment_ref: string | null;
  payment_date: string | null;
  payment_method: string | null;
  payment_receipt_url: string | null;
  exco_resolution_ref: string;
  exco_resolution_date: string;
  // An earlier voucher this one corrects, tops up or otherwise follows from.
  // The number is kept alongside the id so the printed PV still reads correctly
  // even if the referenced row is gone.
  reference_pv_id?: string | null;
  reference_pv_no?: string | null;
  reference_note?: string | null;
  favourite_id: string;
  pv_label: string;
  pv_type: PVType;
  admin_comment: string;
  ministry_verified: string;
  ministry_verified_by: string;
  ministry_verified_at: string;
  head_verified: string;
  head_verified_at: string;
  finance_verified_by: string;
  finance_verified_at: string;
  sig_applicant_name: string;
  sig_applicant_confirm: string;
  applicant_signature_data: string | null;
  biller_code: string;
  cheque_no: string;
  ref_no: string;
  ref_no_2: string;
  dept_head_name: string;
  dept_head_email: string;
  updated_at: string | null;
  tracking_token: string | null;
  signed_pdf_url: string | null;
  accounting_code: string;
  office_ref: string;
}

export interface PVLineItem {
  description: string;
  amount: number;
  date?: string;
}

export interface PVApproval {
  role: string;
  email: string;
  name: string;
  action: "APPROVED" | "REJECTED" | "COMMENT" | "EDIT_COMMENT" | "REVERT";
  timestamp: string;
  remarks: string;
  signature_data?: string;
}

export interface Lookup {
  ministries: string[];
  departments: string[];
  projects: string[];
  ministry_heads: MinistryHead[];
}

export interface MinistryHead {
  ministry: string;
  email: string;
  name: string;
}

export interface Payee {
  id: string;
  name: string;
  bank: string;
  account_no: string;
  ic_no: string;
  address: string;
  email: string;
  phone: string;
}

// Payment Request lifecycle. A ministry's own standing committee (EXCO) must
// verify an expense before it reaches the finance desk, then the General
// Manager approves and instructs Finance to raise the PV.
export type PRStatus =
  | "SUBMITTED"      // awaiting that ministry's EXCO
  | "EXCO_VERIFIED"  // awaiting the General Manager
  | "GM_APPROVED"    // GM has instructed Finance to raise the PV
  | "PV_RAISED"
  | "REJECTED"
  | "CANCELLED";

export type RecurrenceFrequency = "WEEKLY" | "MONTHLY" | "QUARTERLY" | "ANNUAL";

export interface PurchaseRequest {
  id: string;
  request_no: string;
  title: string;
  ministry: string;
  project: string | null;
  submitted_by_email: string;
  submitted_by_name: string | null;
  purpose: string | null;
  estimated_amount: number;
  vendor_name: string | null;
  line_items: { description: string; amount: number; vendor?: string }[];
  attachments: string[];
  status: PRStatus;
  approvals: PVApproval[];
  admin_comment: string | null;
  pv_id: string | null;
  submitted_at: string;
  updated_at: string | null;
  // Payment details, carried onto the PV so Finance never re-keys them.
  payee_name?: string | null;
  payee_bank_name?: string | null;
  payee_bank_acct?: string | null;
  payment_method?: string | null;
  jompay_biller_code?: string | null;
  jompay_ref?: string | null;
  budget_item_id?: string | null;
  dept?: string | null;
  payment_type?: PaymentType | null;
  is_fixed_asset?: boolean;
  asset_description?: string | null;
  applicant_signature?: string | null;
  // Recurring commitments: approved once, then run for the stated term.
  is_recurring?: boolean;
  recurrence_frequency?: RecurrenceFrequency | null;
  recurrence_start?: string | null;
  recurrence_end?: string | null;
  recurring_pv_id?: string | null;
  // Stage audit. exco_signature is affixed to the PV as proof of verification.
  exco_verified_by?: string | null;
  exco_verified_at?: string | null;
  exco_signature?: string | null;
  gm_approved_by?: string | null;
  gm_approved_at?: string | null;
  gm_claim_id?: string | null;
}

export type LOATier = {
  required: 1 | 2;
  roles: string[];
  label: string;
};

export interface BookingItem {
  facility_id: string;
  facility_name: string;
  rate_label: string;
  sessions: number;          // = dates.length (one session per booked date)
  dates?: string[];          // specific session dates (yyyy-mm-dd) for THIS facility
  times?: Record<string, { start: number; end: number }>; // per-date hour block (0-23), keyed by date
  rate_per_session: number;
  is_concurrent: boolean;
  subtotal: number;
}

export type BookingEventType = "WEDDING" | "TRAINING_WORKSHOP" | "WORSHIP_SERVICE" | "FELLOWSHIP_EVENT" | "OTHER";

export interface FacilityBooking {
  id: string;
  booking_no: string;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  booker_org: string;
  booker_type: "PUBLIC" | "MEMBER" | "CONGREGATION" | "HQ";
  event_type: BookingEventType;
  event_name: string;
  start_date: string;
  start_time: string;
  end_date: string | null;
  end_time: string;
  booking_items: BookingItem[];
  total_amount: number;
  status: "ENQUIRY" | "CONFIRMED" | "INVOICED" | "PAID" | "CANCELLED";
  payment_method: string;
  payment_ref: string;
  payment_date: string | null;
  receipt_no: string;
  purpose: string;
  notes: string;
  internal_notes: string;
  attachments: string[];
  booker_signature: string | null;
  booker_signed_at: string | null;
  bem_signature: string | null;
  bem_signed_by: string | null;
  bem_signed_at: string | null;
  invoice_sent_at: string | null;
  invoice_sent_via: string | null;
  invoice_voided_at: string | null;
  invoice_voided_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type WorkerType = "PA_PERSONNEL" | "BUILDING_CARE_TAKER" | "RELA_PERSONNEL";
export type WorksheetPeriodType = "MONTH" | "DAYS";
export type WorksheetStatus = "DRAFT" | "SIGNED" | "PV_RAISED";

export interface WorksheetEntry {
  date: string;        // yyyy-mm-dd
  start_time?: string; // "HH:MM" — hours is derived from start_time/end_time when both are set
  end_time?: string;   // "HH:MM"
  hours: number;        // computed from start_time/end_time; kept for older rows entered as a raw number
  purpose?: string;    // optional remarks for that day (e.g. "Easter service security cover")
  // RELA Personnel only: each entry is a named person (no date/time), paid the
  // flat session rate, who signs their own line on the worksheet.
  name?: string;
  signature?: string;
}

export interface WorkerWorksheet {
  id: string;
  worksheet_no: string;
  worker_type: WorkerType;
  worker_name: string;
  bank_name: string | null;
  bank_account_no: string | null;
  period_type: WorksheetPeriodType;
  period_label: string;
  entries: WorksheetEntry[];
  rate_per_hour: number;
  total_hours: number;
  total_amount: number;
  worker_signature: string | null;
  worker_signed_at: string | null;
  bem_signature: string | null;
  bem_signed_by: string | null;
  bem_signed_at: string | null;
  status: WorksheetStatus;
  pdf_url: string | null;
  pv_id: string | null;
  notes: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export type FacilityBlockReason = "REHEARSAL" | "EVENT_HOLD" | "MAINTENANCE" | "OTHER";

export interface FacilityBlock {
  id: string;
  facility_id: string | null; // null = all facilities / whole venue
  start_date: string;
  end_date: string;
  reason: FacilityBlockReason;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface IncomeRecord {
  id: string;
  record_no: string;
  income_type: "ELECTRICITY" | "DONATION" | "OTHER";
  payer_name: string;
  payer_org: string;
  description: string;
  amount: number;
  payment_date: string;
  payment_method: string;
  payment_ref: string;
  period_covered: string;
  notes: string;
  created_by: string;
  created_at: string;
}

// ─── Payroll ────────────────────────────────────────────────────────────────

export type EmploymentType = "PERMANENT" | "CONTRACT";
export type PostingType = "CHURCH" | "OFFICE" | "OTHER";
export type PayrollEmployeeStatus = "ACTIVE" | "RESIGNED";

export interface PayrollEmployee {
  id: string;
  emp_no: string;
  /** The People Directory record this employee is — see migration 157. The
      link is written here; people.payroll_employee_id follows by trigger. */
  person_id: string | null;
  full_name: string;
  ic_no: string;
  dob: string | null;
  designation: string;
  employment_type: EmploymentType;
  is_pastor: boolean;
  is_staff: boolean;
  prior_experience_years: number;
  is_orang_asli: boolean;
  date_commenced: string | null;
  increment_month_override: number | null; // NULL = automatic (join-date rule); else 1 or 7
  commencement_base: number;
  posting_type: PostingType;
  church_name: string;
  department: string;
  marital_status: string;
  spouse_working: boolean;
  children_under_18: number;
  children_in_college: number;
  epf_voluntary_ee_amount: number;
  /** Opted out of SKBBK (Lindung 24). False — in the scheme — is the default. */
  skbbk_opted_out: boolean;
  epf_no: string;
  tin: string;
  revised_note: string;
  employer_tax_ref: string;
  bank_name: string;
  bank_acct: string;
  phone_no: string;
  email: string;
  status: PayrollEmployeeStatus;
  resigned_date: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PayrollStatutoryRates {
  year: number;
  epf_ee_under60: number; epf_er_under60: number;
  epf_ee_over60: number; epf_er_over60: number;
  epf_ee_orang_asli: number; epf_er_orang_asli: number;
  socso_ee: number; socso_er: number; socso_er_over60: number; socso_ceiling: number;
  eis_rate: number; eis_ceiling: number;
  // SKBBK (Lindung 24) — employee side only, so no employer rate.
  skbbk_ee: number; skbbk_ceiling: number;
  /** First month SKBBK applies. 1 = all year; 2026 = 6. See migration 133. */
  skbbk_from_month: number;
  updated_by: string;
  updated_at: string;
}

export interface PayrollSalary {
  id: string;
  employee_id: string;
  effective_from: string;
  base_salary: number;
  stm_allowance: number;
  experience_bonus: number;
  family_allowance: number;
  increment_carried: number;
  increment_current: number;
  reason: string;
  created_by: string;
  created_at: string;
}

export type PayrollRunStatus = "DRAFT" | "FINALIZED" | "PAID";
// PERKESO covers SOCSO + EIS on one remittance. SOCSO/EIS remain for runs
// finalized before they were merged.
export type PayrollVoucherKind = "SALARY" | "EPF" | "PERKESO" | "PCB" | "SOCSO" | "EIS";

export interface PayrollRun {
  id: string;
  year: number;
  month: number; // 1-12, or 13 = 13th month
  status: PayrollRunStatus;
  total_gross: number;
  total_net: number;
  total_employer: number;
  total_lcm: number;
  created_by: string;
  finalized_at: string | null;
  created_at: string;
  // Set once the run's payment vouchers have been raised for approval.
  pvs_generated_at?: string | null;
  pvs_generated_by?: string | null;
  reverted_at?: string | null;
  reverted_by?: string | null;
  revert_reason?: string | null;
}

export interface CustomPayrollItem {
  label: string;
  type: "allowance" | "deduction";
  amount: number;
}

export interface PayrollEmployeeCustomItem {
  id: string;
  employee_id: string;
  year: number;
  month: number; // 1-13 — "from" month when is_recurring = true
  label: string;
  type: "allowance" | "deduction";
  amount: number;
  is_recurring: boolean;
  recur_until_year: number | null;  // null = no end date
  recur_until_month: number | null; // 1-13
  created_by: string | null;
  created_at: string;
}

export interface PayrollLine {
  id: string;
  run_id: string;
  employee_id: string;
  employee_name: string;
  gross: number;
  pcb: number;
  epf_ee: number; epf_er: number;
  skbbk: number;
  socso_ee: number; socso_er: number;
  eis_ee: number; eis_er: number;
  epl: number;
  net: number;
  total_lcm: number;
  custom_items: CustomPayrollItem[];
  /** Corrections as they stood when the run was finalized — see migration 131. */
  adjustments: PayrollAdjustmentSnapshot[];
  created_at: string;
}

/**
 * One named payroll figure an adjustment can move.
 *
 * Defined here rather than in lib/payroll/calc.ts because calc.ts already
 * imports from this module; the other direction would make the two circular.
 * Every value is a column of the yearly sheet, so an adjustment always has
 * somewhere to show itself — and always lands in the right box on the
 * statutory return. See migration 131.
 */
export type AdjustmentCategory =
  | "GROSS" | "PCB"
  | "EPF_EE" | "EPF_ER"
  | "SOCSO_EE" | "SOCSO_ER"
  | "SKBBK"
  | "EIS_EE" | "EIS_ER"
  | "NET";

/** What each category is called on screen, and which side of the pay it sits. */
export const ADJUSTMENT_CATEGORIES: {
  key: AdjustmentCategory; label: string; group: string; side: "employee" | "employer" | "pay";
}[] = [
  { key: "GROSS",    label: "Gross / back pay", group: "Pay",    side: "pay" },
  { key: "NET",      label: "Net pay only",     group: "Pay",    side: "pay" },
  { key: "PCB",      label: "PCB (tax)",        group: "LHDN",   side: "employee" },
  { key: "EPF_EE",   label: "EPF — employee",   group: "EPF",    side: "employee" },
  { key: "EPF_ER",   label: "EPF — employer",   group: "EPF",    side: "employer" },
  { key: "SOCSO_EE", label: "SOCSO — employee", group: "SOCSO",  side: "employee" },
  { key: "SKBBK",    label: "SKBBK (Lindung 24)", group: "SOCSO", side: "employee" },
  { key: "SOCSO_ER", label: "SOCSO — employer", group: "SOCSO",  side: "employer" },
  { key: "EIS_EE",   label: "EIS — employee",   group: "EIS",    side: "employee" },
  { key: "EIS_ER",   label: "EIS — employer",   group: "EIS",    side: "employer" },
];

export const adjustmentLabel = (c: AdjustmentCategory): string =>
  ADJUSTMENT_CATEGORIES.find(x => x.key === c)?.label ?? c;

/**
 * A correction to one named payroll figure, landing in one month.
 *
 * `amount` is signed and always means "add this to the named figure", whatever
 * the category. What that does to take-home follows from what the figure is:
 * more SKBBK is less in hand, more GROSS is more.
 */
export interface PayrollAdjustment {
  id: string;
  employee_id: string;
  year: number;
  month: number;
  category: AdjustmentCategory;
  amount: number;
  reason: string;
  /** The period being corrected, when it is not the month this lands in. */
  origin_year: number | null;
  origin_month: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** What a finalized line keeps: enough to itemise, without the row's identity. */
export interface PayrollAdjustmentSnapshot {
  category: AdjustmentCategory;
  amount: number;
  reason?: string;
}

export interface PayrollVoucher {
  id: string;
  run_id: string;
  kind: PayrollVoucherKind;
  payee: string;
  total_amount: number;
  status: "PENDING" | "PAID";
  paid_at: string | null;
  payment_ref: string;
  created_at: string;
  // The payment voucher raised from this payroll voucher, so the run can be
  // reverted and its PVs cancelled rather than left orphaned mid-approval.
  pv_id?: string | null;
  pv_no?: string | null;
  pv_status?: string | null;
  generated_at?: string | null;
  generated_by?: string | null;
}

export type LoanStatus = "PENDING" | "ACTIVE" | "SETTLED" | "REJECTED" | "CANCELLED";

export interface LoanSignature {
  name: string;
  email: string;
  role: string;
  signature: string; // PNG data URL drawn on the signature pad
  signed_at: string;
}

export interface LoanSignatures {
  applicant?: LoanSignature;
  bishop?: LoanSignature;
  treasurer?: LoanSignature;
}

export interface EmployeeLoan {
  id: string;
  loan_no: string;
  employee_id: string;
  principal: number;
  monthly_installment: number;
  term_months: number;
  final_installment: number;
  start_month: string | null;
  purpose: string;
  agreement_url: string;
  status: LoanStatus;
  approvals: PVApproval[];
  signatures: LoanSignatures | null;
  attachment_path: string;
  attachment_name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface LoanRepayment {
  id: string;
  loan_id: string;
  payroll_run_id: string | null;
  year: number;
  month: number;
  amount: number;
  balance_after: number;
  created_at: string;
}

export interface BulkRun {
  id: string;
  group_name: string;
  run_by: string;
  run_date: string;
  pv_ids: string[];
  pv_nos: string[];
  total_amount: number;
  pv_count: number;
  ministry: string;
  created_at: string;
  is_master?: boolean;
  master_name?: string;
  child_group_names?: string[];
  approvals?: PVApproval[];
}
