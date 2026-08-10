// The LCM Leave Application Form, reproduced.
//
// This is not a summary of a leave record — it is the church's own form, laid
// out as printed, because HR files this sheet and an auditor expects to see the
// document they know. So the structure below follows the official PDF exactly:
// the Submitted by block, the two leave-balance rows, the nine leave types as a
// tick grid, four fixed approver columns, and the six notes verbatim.
//
// The four approver columns are fixed by the form. Whoever the system worked
// out as approvers is mapped onto them by the office they hold, so a column is
// either filled with a real signature or left blank for hand-signing — never
// renamed, because a form whose headings move is no longer the form.
//
// Built as an HTML string and opened in a new window, matching how payment
// vouchers print (see components/pv/pv-html.ts). The browser's print dialog
// does "Save as PDF".

export interface LeaveFormApprover {
  email: string;
  name: string;
  position?: string;
  external?: boolean;
}

export interface LeaveFormApproval {
  email?: string;
  name: string;
  position?: string;
  action: string;
  timestamp: string;
  remarks?: string;
  signature_data?: string;
  for_email?: string;
}

export interface LeaveFormData {
  leave_no: string;
  applicant_name: string;
  applicant_email: string;
  designation?: string | null;
  leave_type: string;
  leave_type_code?: string;
  start_date: string;
  end_date: string;
  days: number;
  reason?: string;
  status: string;
  applied_at: string;
  applicant_signature?: string | null;
  /** Days left before this application was made — snapshotted at submission. */
  balance_annual_before?: number | null;
  balance_medical_before?: number | null;
  required_approvers: LeaveFormApprover[];
  approvals: LeaveFormApproval[];
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
  if (isNaN(d.getTime())) return String(s);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

// The nine types on the printed form, in its column order.
const LEAVE_TYPES: { code: string; label: string }[][] = [
  [{ code: "ANNUAL", label: "Annual Leave" }, { code: "PATERNITY", label: "Paternity Leave" }, { code: "STUDY", label: "Study Leave" }],
  [{ code: "MEDICAL", label: "Medical Leave" }, { code: "MATERNITY", label: "Maternity Leave" }, { code: "UNPAID", label: "Unpaid Leave" }],
  [{ code: "HOSPITALISATION", label: "Hospitalization Leave" }, { code: "COMPASSIONATE", label: "Compassionate Leave" }, { code: "EMERGENCY", label: "Emergency Leave" }],
];

const COLUMNS = ["Head of Department", "Council Chairman/Rep", "Dean", "Bishop"] as const;

/**
 * Put each approver in the column that matches the office they hold.
 *
 * The form's columns are fixed, but the system's chain varies with who is
 * applying — a head pastor, a Dean, the General Manager. Matching on the
 * position keeps every signature under the heading a reader expects. Anyone
 * who fits nowhere drops into the first free column rather than being lost.
 */
function assignColumns(
  approvers: LeaveFormApprover[],
  approvals: LeaveFormApproval[],
): ({ approver: LeaveFormApprover; approval?: LeaveFormApproval } | null)[] {
  const slots: ({ approver: LeaveFormApprover; approval?: LeaveFormApproval } | null)[] = [null, null, null, null];

  const decisionFor = (a: LeaveFormApprover) =>
    approvals.find(d => norm(d.email) === norm(a.email) || norm(d.for_email) === norm(a.email));

  const columnFor = (a: LeaveFormApprover): number | null => {
    const p = norm(a.position);
    if (a.external || p.includes("council")) return 1;
    if (p.includes("dean")) return 2;
    if (p.includes("bishop")) return 3;
    // Head pastor, department head, General Manager — the person the applicant
    // answers to day to day, which is what this column means.
    if (p.includes("head pastor") || p.includes("head of department")
        || p.includes("general manager") || p.includes("manager")) return 0;
    return null;
  };

  const leftover: LeaveFormApprover[] = [];
  for (const a of approvers) {
    const c = columnFor(a);
    if (c !== null && !slots[c]) slots[c] = { approver: a, approval: decisionFor(a) };
    else leftover.push(a);
  }
  for (const a of leftover) {
    const free = slots.findIndex(s => s === null);
    if (free >= 0) slots[free] = { approver: a, approval: decisionFor(a) };
  }
  return slots;
}

const NOTES = [
  "Leave Application Form for Annual Leave need to be submitted at least 7 days prior to leave applied for.",
  "All other leave applications need to be supported with relevant documents (e.g., medical/death cert, etc.).",
  "Emergency Leave must be supported by relevant documents for it to be reviewed and further classified as Annual Leave taken or Unpaid Leave taken.",
  "In the case of Pastors and Parish Workers, leave applied for overseas travel purposes has to be submitted one month in advance and needs the Bishop’s approval.",
  "Unutilized Leave: Maximum of 10 days can be carried forward to the next Calendar Year and must be utilized by 30 April of the following year.",
  "All Pastors, as well as all employees drawing salaries directly from LCM Head Office need to submit this Leave Application Form to Head Office for filing in their respective Personal Record Files after the Leave Form has been duly signed by all parties concerned.",
];

export function leaveFormHtml(l: LeaveFormData, logoDataUri = ""): string {
  const slots = assignColumns(l.required_approvers ?? [], l.approvals ?? []);
  const selected = norm(l.leave_type_code) || norm(l.leave_type);

  const isSelected = (code: string, label: string) =>
    selected === norm(code) || selected === norm(label) || norm(l.leave_type) === norm(label);

  const typeRows = LEAVE_TYPES.map(row => `
    <tr>${row.map(t => `
      <td class="type">
        <span class="box">${isSelected(t.code, t.label) ? "&#10004;" : "&nbsp;"}</span>${esc(t.label)}
      </td>`).join("")}</tr>`).join("");

  const approverCols = slots.map((s, i) => {
    const decided = s?.approval;
    const approved = decided?.action === "APPROVED";
    const rejected = decided?.action === "REJECTED";
    return `
      <td class="appr">
        <div class="appr-head">${esc(COLUMNS[i])}</div>
        <div class="tick"><span class="box">${approved ? "&#10004;" : "&nbsp;"}</span>Approved</div>
        <div class="tick"><span class="box">${rejected ? "&#10004;" : "&nbsp;"}</span>Rejected</div>
        <div class="sig">${decided?.signature_data
          ? `<img src="${esc(decided.signature_data)}" alt="signature" />` : ""}</div>
        <div class="sig-line">
          <div class="lbl">Name &amp; Signature</div>
          <div class="val">${esc(decided?.name ?? s?.approver.name ?? "")}</div>
        </div>
        <div class="sig-line">
          <div class="lbl">Date</div>
          <div class="val">${decided ? esc(fmtDate(decided.timestamp)) : ""}</div>
        </div>
      </td>`;
  }).join("");

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Leave Application — ${esc(l.leave_no)} — ${esc(l.applicant_name)}</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;color:#000;background:#eef2f7;font-size:13px}
  .toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:flex-end;gap:8px;
    padding:12px 16px;background:#fff;border-bottom:1px solid #e2e8f0}
  .toolbar button{font:600 13px Arial,sans-serif;border:none;border-radius:8px;padding:9px 18px;cursor:pointer}
  .btn-print{background:#173a72;color:#fff}
  .btn-close{background:#e2e8f0;color:#334155}
  .sheet{max-width:800px;margin:20px auto;background:#fff;padding:34px 40px;
    box-shadow:0 2px 12px rgba(0,0,0,.08)}
  .head{display:flex;align-items:center;gap:12px;margin-bottom:6px}
  .head img{width:52px;height:52px}
  .org{font-size:15px;font-weight:700}
  .org-sub{font-size:11px;color:#444}
  .ref{margin-left:auto;text-align:right;font-size:11px;color:#444}
  h1{text-align:center;font-size:17px;margin:14px 0 12px;letter-spacing:.3px}
  table{width:100%;border-collapse:collapse}
  td,th{border:1px solid #000;padding:6px 8px;vertical-align:top;font-size:13px}
  .lab{width:34%;font-weight:600;background:#fafafa}
  .sub{width:22%;font-weight:600}
  .val{min-height:20px}
  .sig-space{height:52px}
  .sig-space img{max-height:50px;max-width:100%;object-fit:contain}
  .type{width:33.33%;font-size:12.5px}
  .box{display:inline-block;width:14px;height:14px;border:1px solid #000;
    text-align:center;line-height:13px;font-size:11px;margin-right:7px;vertical-align:-2px}
  .appr{width:25%;padding:0}
  .appr-head{font-weight:700;font-size:12px;padding:5px 6px;border-bottom:1px solid #000;
    background:#f0f0f0;text-align:center}
  .tick{padding:3px 6px;font-size:12px}
  .sig{height:56px;display:flex;align-items:flex-end;justify-content:center;padding:0 4px}
  .sig img{max-height:54px;max-width:100%;object-fit:contain}
  .sig-line{border-top:1px solid #000;padding:3px 6px}
  .sig-line .lbl{font-size:10px;color:#555}
  .sig-line .val{font-size:11.5px;font-weight:600;min-height:14px}
  .notes{margin-top:14px;font-size:11px;line-height:1.5}
  .notes li{margin-bottom:3px}
  .notes ol{padding-left:18px;margin:4px 0 0}
  .auth{margin:4px 0 0 18px;list-style:none;padding:0}
  .status{margin-top:10px;text-align:center;font-size:12px;font-weight:700;letter-spacing:.4px}
  @media print{
    .toolbar{display:none}
    body{background:#fff;font-size:12px}
    .sheet{max-width:none;margin:0;box-shadow:none;padding:0}
    @page{size:A4;margin:12mm}
  }
</style></head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>

  <div class="sheet">
    <div class="head">
      ${logoDataUri ? `<img src="${esc(logoDataUri)}" alt="" />` : ""}
      <div>
        <div class="org">LUTHERAN CHURCH IN MALAYSIA</div>
        <div class="org-sub">Luther Centre, No. 6, Jalan Utara, 46200 Petaling Jaya, Selangor</div>
      </div>
      <div class="ref">
        Ref: <b>${esc(l.leave_no)}</b><br />Applied: ${esc(fmtDate(l.applied_at))}
      </div>
    </div>

    <h1>LEAVE APPLICATION FORM</h1>

    <table>
      <tr>
        <td class="lab" rowspan="4">Submitted by</td>
        <td class="sub">Name</td>
        <td class="val">${esc(l.applicant_name)}</td>
      </tr>
      <tr>
        <td class="sub">Signature</td>
        <td class="sig-space">${l.applicant_signature
          ? `<img src="${esc(l.applicant_signature)}" alt="signature" />` : ""}</td>
      </tr>
      <tr>
        <td class="sub">Position</td>
        <td class="val">${esc(l.designation ?? "")}</td>
      </tr>
      <tr>
        <td class="sub">Date</td>
        <td class="val">${esc(fmtDate(l.applied_at))}</td>
      </tr>

      <tr>
        <td class="lab" colspan="2">Balance Annual Leave (No. of days before this application)</td>
        <td class="val">${l.balance_annual_before ?? "" }</td>
      </tr>
      <tr>
        <td class="lab" colspan="2">Balance Medical Leave (No. of days before this application)</td>
        <td class="val">${l.balance_medical_before ?? ""}</td>
      </tr>
      <tr>
        <td class="lab" colspan="2">Dates and No. of Leave Days applied</td>
        <td class="val">
          ${esc(fmtDate(l.start_date))} &ndash; ${esc(fmtDate(l.end_date))}
          &nbsp;(${esc(l.days)} day${Number(l.days) === 1 ? "" : "s"})
        </td>
      </tr>
    </table>

    <table style="border-top:none">
      ${typeRows}
    </table>

    <table style="border-top:none">
      <tr>${approverCols}</tr>
    </table>

    ${l.status === "REJECTED"
      ? `<div class="status">THIS APPLICATION WAS NOT APPROVED</div>`
      : l.status === "CANCELLED"
      ? `<div class="status">THIS APPLICATION WAS WITHDRAWN</div>`
      : ""}

    <div class="notes">
      <ol>
        ${NOTES.map(n => `<li>${esc(n)}</li>`).join("")}
      </ol>
      <ul class="auth">
        <li>Approving Authority for:</li>
        <li>&nbsp;&nbsp;a. Pastors &nbsp;- (i) Council Chairman/Rep; &amp; (ii) Dean</li>
        <li>&nbsp;&nbsp;b. Dean &nbsp;&nbsp;&nbsp;&nbsp;- (i) Bishop</li>
        <li>&nbsp;&nbsp;c. Admin Staff - (i) Department Head</li>
      </ul>
    </div>
  </div>
</body></html>`;
}

export function openLeaveForm(l: LeaveFormData, logoDataUri = "") {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(leaveFormHtml(l, logoDataUri));
  w.document.close();
}
