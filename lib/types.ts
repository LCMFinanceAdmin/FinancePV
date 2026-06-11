export type UserRole =
  | "FINANCE_ADMIN"
  | "GENERAL_MANAGER"
  | "BISHOP"
  | "TREASURER"
  | "SECRETARY"
  | "MINISTRY_HEAD"
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
  | "CANCELLED";

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
  exco_resolution_ref: string;
  exco_resolution_date: string;
  favourite_id: string;
  pv_label: string;
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
  action: "APPROVED" | "REJECTED" | "COMMENT";
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
