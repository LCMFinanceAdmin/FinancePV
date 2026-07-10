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
  isSignatory: boolean;
  signatoryRole: string;
  isMinistryHead: boolean;
  isGeneralManager: boolean;
  isBuildingManager: boolean;
  isBamCommittee?: boolean;
  isTestAdmin: boolean;
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

export type PRStatus = "SUBMITTED" | "APPROVED" | "REJECTED" | "PV_RAISED";

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
export type PayrollVoucherKind = "SALARY" | "EPF" | "SOCSO" | "EIS" | "PCB";

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
  socso_ee: number; socso_er: number;
  eis_ee: number; eis_er: number;
  epl: number;
  net: number;
  total_lcm: number;
  custom_items: CustomPayrollItem[];
  created_at: string;
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
