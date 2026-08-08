// The leave application as a signed form.
//
// Approving used to be a button click that left a timestamp, which is not what
// HR files and not what an auditor asks for. This renders the same information
// as a document: the applicant's details and hand at the top, then a signature
// box per approving officer showing their name, the office they held, the date
// and their drawn signature — the paper form, reproduced.
//
// Built as an HTML string and opened in a new window, matching how payment
// vouchers print (see components/pv/pv-html.ts). The browser's own print dialog
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
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: string;
  applied_at: string;
  applicant_signature?: string | null;
  required_approvers: LeaveFormApprover[];
  approvals: LeaveFormApproval[];
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return String(s).slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();

/** The decision that answers a given slot — by the person named, or whoever signed for them. */
function decisionFor(slot: LeaveFormApprover, approvals: LeaveFormApproval[]) {
  return approvals.find(a =>
    (norm(a.email) === norm(slot.email) || norm(a.for_email) === norm(slot.email)));
}

function sigBox(label: string, name: string, position: string, dateStr: string, sig?: string | null, pending?: string) {
  return `
    <div class="sig-cell">
      <div class="sig-head">
        <div class="sig-label">${esc(label)}</div>
        ${position ? `<div class="sig-sub">${esc(position)}</div>` : ""}
      </div>
      <div class="sig-space">${sig ? `<img src="${esc(sig)}" alt="signature" />` : ""}</div>
      <div class="sig-foot">
        ${name
          ? `<div class="sig-name">${esc(name)}</div>${dateStr ? `<div class="sig-date">${esc(dateStr)}</div>` : ""}`
          : `<div class="sig-pending">${esc(pending ?? "Pending")}</div>`}
      </div>
    </div>`;
}

export function leaveFormHtml(l: LeaveFormData, logoDataUri = ""): string {
  const boxes = (l.required_approvers ?? []).map(slot => {
    const d = decisionFor(slot, l.approvals ?? []);
    const approved = d?.action === "APPROVED";
    const rejected = d?.action === "REJECTED";
    // The office is what the form should name — the person filling it may
    // change, the post doesn't.
    const position = slot.position || d?.position || "";
    return sigBox(
      rejected ? "Rejected by:" : "Approved by:",
      d && (approved || rejected) ? (d.name || d.email || "") : "",
      position,
      d ? `Date: ${fmtDate(d.timestamp)}` : "",
      approved ? d?.signature_data : null,
      `Pending — ${slot.name}`,
    );
  }).join("");

  const remarks = (l.approvals ?? []).filter(a => a.remarks?.trim());

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${esc(l.leave_no)} — Leave Application</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #f1f5f9; font-size: 15px; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: flex-end; gap: 8px;
             padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  .toolbar button { font: 600 13px Arial, sans-serif; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; }
  .btn-print { background: #173a72; color: #fff; }
  .sheet { max-width: 820px; margin: 20px auto; background: #fff; padding: 34px 40px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 10px; }
  .head img { width: 52px; height: 52px; }
  .org-name { font-size: 19px; font-weight: 700; }
  .org-line { font-size: 13px; color: #555; }
  .ref { margin-left: auto; border: 1px solid #000; padding: 6px 10px; text-align: center; }
  .ref-label { font-size: 12px; font-weight: 700; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
  .ref-no { font-size: 16px; font-weight: 700; }
  .title { text-align: center; font-weight: 700; font-size: 18px; margin: 10px 0 2px; }
  .subtitle { text-align: center; font-size: 14px; color: #444; margin-bottom: 10px; }
  .status { text-align: center; margin-bottom: 12px; }
  .pill { display: inline-block; border-radius: 999px; padding: 3px 14px; font-size: 13px; font-weight: 700; }
  .ok { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
  .no { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
  .wait { background: #fef3c7; color: #a16207; border: 1px solid #fcd34d; }
  .info { border: 1px solid #000; margin-bottom: 10px; }
  .info-cell { padding: 6px 8px; border-bottom: 1px solid #000; font-size: 15px; }
  .info-cell:last-child { border-bottom: none; }
  .info-row { display: flex; }
  .info-row .info-cell { flex: 1; border-right: 1px solid #000; }
  .info-row .info-cell:last-child { border-right: none; }
  .sig-row { display: flex; flex-wrap: wrap; gap: 0; margin-bottom: 10px; }
  .sig-cell { flex: 1 1 33%; min-width: 210px; border: 1px solid #000; margin-right: -1px; margin-bottom: -1px; padding: 8px 10px; }
  .sig-head { border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; }
  .sig-label { font-weight: 700; font-size: 14px; }
  .sig-sub { font-size: 13px; color: #555; }
  .sig-space { height: 56px; display: flex; align-items: flex-end; }
  .sig-space img { max-height: 54px; max-width: 100%; object-fit: contain; }
  .sig-foot { border-top: 1px solid #000; padding-top: 4px; }
  .sig-name { font-weight: 700; font-size: 14px; }
  .sig-date { font-size: 13px; }
  .sig-pending { font-size: 13px; color: #999; }
  .section { font-weight: 700; font-size: 14px; margin: 12px 0 4px; }
  .remark { font-size: 13px; margin-bottom: 2px; }
  .foot { margin-top: 16px; font-size: 12px; color: #666; text-align: center; }
  @media print {
    .toolbar { display: none; }
    body { background: #fff; }
    .sheet { max-width: none; margin: 0; box-shadow: none; padding: 0; }
    @page { size: A4; margin: 14mm; }
  }
</style></head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">Print / Save as PDF</button>
  </div>
  <div class="sheet">
    <div class="head">
      ${logoDataUri ? `<img src="${esc(logoDataUri)}" alt="" />` : ""}
      <div>
        <div class="org-name">LUTHERAN CHURCH IN MALAYSIA</div>
        <div class="org-line">(ROS: PPM-001-10-09031964)</div>
        <div class="org-line">Luther Centre, No. 6, Jalan Utara, 46200 Petaling Jaya, Selangor</div>
      </div>
      <div class="ref">
        <div class="ref-label">REFERENCE</div>
        <div class="ref-no">${esc(l.leave_no)}</div>
      </div>
    </div>

    <div class="title">APPLICATION FOR LEAVE</div>
    <div class="subtitle">Staff Services</div>

    <div class="status">
      <span class="pill ${l.status === "APPROVED" ? "ok" : l.status === "REJECTED" ? "no" : "wait"}">
        ${esc(l.status)}
      </span>
    </div>

    <div class="info">
      <div class="info-row">
        <div class="info-cell">Name: <b>${esc(l.applicant_name)}</b></div>
        <div class="info-cell">Applied: <b>${esc(fmtDate(l.applied_at))}</b></div>
      </div>
      <div class="info-cell">Email: ${esc(l.applicant_email)}${l.designation ? ` &nbsp;·&nbsp; ${esc(l.designation)}` : ""}</div>
      <div class="info-row">
        <div class="info-cell">Type of leave: <b>${esc(l.leave_type)}</b></div>
        <div class="info-cell">Working days: <b>${esc(l.days)}</b></div>
      </div>
      <div class="info-cell">Period: <b>${esc(fmtDate(l.start_date))} to ${esc(fmtDate(l.end_date))}</b></div>
      <div class="info-cell">Reason: ${esc(l.reason)}</div>
    </div>

    <div class="section">Declaration by applicant</div>
    <div class="sig-row">
      ${sigBox("Applicant's signature:", l.applicant_name, l.designation || "", `Date: ${fmtDate(l.applied_at)}`, l.applicant_signature)}
    </div>

    <div class="section">Approval</div>
    <div class="sig-row">${boxes}</div>

    ${remarks.length ? `<div class="section">Remarks</div>${remarks.map(a =>
      `<div class="remark">${esc(a.name)}${a.position ? ` (${esc(a.position)})` : ""}: ${esc(a.remarks)}</div>`).join("")}` : ""}

    <div class="foot">
      Generated from the LCM Finance system on ${esc(fmtDate(new Date().toISOString()))}.
      Signatures shown were captured electronically at the time each decision was recorded.
    </div>
  </div>
</body></html>`;
}

/** Open the form in a new window, ready to print or save as PDF. */
export function openLeaveForm(l: LeaveFormData, logoDataUri = "") {
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(leaveFormHtml(l, logoDataUri));
  w.document.close();
}
