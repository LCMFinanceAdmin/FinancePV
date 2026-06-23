export type UserRole =
  | "FINANCE_ADMIN"
  | "GENERAL_MANAGER"
  | "BISHOP"
  | "TREASURER"
  | "SECRETARY"
  | "MINISTRY_HEAD"
  | "BUILDING_MANAGER"
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
  biller_code: string;
  cheque_no: string;
  ref_no: string;
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
  sessions: number;
  rate_per_session: number;
  is_concurrent: boolean;
  subtotal: number;
}

export interface FacilityBooking {
  id: string;
  booking_no: string;
  booker_name: string;
  booker_email: string;
  booker_phone: string;
  booker_org: string;
  booker_type: "PUBLIC" | "MEMBER" | "CONGREGATION" | "HQ";
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
  created_by: string;
  created_at: string;
  updated_at: string;
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
  status: PayrollEmployeeStatus;
  resigned_date: string | null;
  created_by: string;
  created_at: string;
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
