import type { PV, PVApproval } from "@/lib/types";
import { getLOATier, roleLabel } from "@/lib/utils";

// HTML-based Payment Voucher rendering — the reliable counterpart to the
// react-pdf PVDocument. An ordinary <img> renders signatures dependably in
// every browser (react-pdf's image layout proved fragile), and the user
// prints or "Save as PDF" from the browser's own print dialog. Attachments
// stay visible on this page rather than requiring a separate download:
// images are embedded directly, PDFs are embedded via <iframe> (viewable
// on-screen; Chrome also includes iframe content when printing/saving as
// PDF), and any other file type — which no browser can render inline — gets
// a clearly labelled open-in-new-tab link. For a single merged PDF that also
// bundles PDF attachments as extra pages, the react-pdf "Download" path
// remains available.

const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB",
  "public bank": "PBB", "rhb": "RHB", "hong leong bank": "HLB",
  "ambank": "AMB", "bank islam": "BIMB", "bank rakyat": "BPR",
  "ocbc": "OCBC", "standard chartered": "SCB", "affin bank": "AFFIN",
  "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};
function getBankAbbr(name: string) {
  return BANK_ABBR[(name || "").toLowerCase().trim()] ?? name;
}
function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtDate(sVal?: string | null) {
  if (!sVal) return "";
  const d = new Date(sVal);
  if (isNaN(d.getTime())) return sVal.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function isImageUrl(url: string) {
  return url.startsWith("data:image/") || /\.(png|jpe?g|gif|webp|bmp)(\?|$)/i.test(url);
}
function isPdfUrl(url: string) {
  return url.startsWith("data:application/pdf") || /\.pdf(\?|$)/i.test(url);
}
function isHtmlUrl(url: string) {
  return url.startsWith("data:text/html") || /\.html?(\?|$)/i.test(url);
}
function fileName(url: string) {
  if (url.startsWith("data:")) return "attachment";
  try { return decodeURIComponent(url.split("/").pop()?.split("?")[0] || url); }
  catch { return url; }
}

// A signature box: label (+ optional subtitle), the signature image space,
// then a name/date footer. Mirrors the react-pdf SigBox layout.
function sigCell(label: string, subtitle: string | null, sig: string | null | undefined, name: string | null, dateStr: string | null, pending?: string): string {
  return `
    <div class="sig-cell">
      <div class="sig-head">
        <div class="sig-label">${esc(label)}</div>
        ${subtitle ? `<div class="sig-sub">${esc(subtitle)}</div>` : ""}
      </div>
      <div class="sig-space">${sig ? `<img src="${esc(sig)}" alt="signature" />` : ""}</div>
      <div class="sig-foot">
        ${name
          ? `<div class="sig-name">${esc(name)}</div>${dateStr ? `<div class="sig-date">${esc(dateStr)}</div>` : ""}`
          : `<div class="sig-pending">${esc(pending ?? "Pending")}</div>`}
      </div>
    </div>`;
}

function paidBanner(pv: PV): string {
  const line = [pv.payment_method, pv.payment_ref && `Ref: ${pv.payment_ref}`, pv.paid_at && fmtDate(pv.paid_at)]
    .filter(Boolean).join("  ·  ");
  return `
    <div class="paid">
      <div class="paid-stamp">PAID</div>
      <div>
        <div class="paid-title">Payment Completed</div>
        <div class="paid-line">${esc(line)}</div>
        ${pv.paid_by ? `<div class="paid-line">Marked paid by ${esc(pv.paid_by)} (Finance Executive)</div>` : ""}
      </div>
    </div>`;
}

/**
 * Pages of a PDF attachment already rendered to images, keyed by URL.
 *
 * A browser's print engine captures a PDF <iframe> as the *viewer widget*, not
 * the document inside it, so an attached payslip printed as a picture of a PDF
 * reader. When rendered pages are supplied they are laid out as ordinary
 * images, which print in full; without them the iframe is kept so the on-screen
 * preview still works.
 */
export type PdfPageImages = Record<string, { dataUri: string; width: number; height: number }[]>;

export function pvPrintHtml(pv: PV, logoDataUri = "", pdfPages: PdfPageImages = {}): string {
  const items = pv.line_items ?? [];
  const approvals: PVApproval[] = pv.approvals ?? [];
  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) || pv.amount;
  const padRows = Math.max(0, 5 - items.length);
  const loa = getLOATier(pv.amount, pv.payment_type);

  const bankLine = pv.payment_method?.toLowerCase() === "jompay"
    ? `Biller: ${pv.biller_code ?? "—"} | Ref: ${pv.ref_no ?? "—"}`
    : pv.payee_bank_name
      ? `${getBankAbbr(pv.payee_bank_name)}${pv.payee_bank_acct ? " | " + pv.payee_bank_acct : ""}`
      : "";
  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join(" / ");

  const financeApproval = approvals.find(a => a.role === "FINANCE_ADMIN" && a.action === "APPROVED")
    ?? (pv.finance_verified_by ? { role: "FINANCE_ADMIN", email: "", name: pv.finance_verified_by, action: "APPROVED" as const, timestamp: pv.finance_verified_at, remarks: "" } : undefined);
  const gmApproval = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
  const sigApprovals = approvals.filter(a => ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED");
  const excoApproval = approvals.find(a => a.role === "MINISTRY_HEAD" && a.action === "APPROVED");

  const ministryVerified =
    String(pv.ministry_verified ?? "").toUpperCase() === "YES" ||
    String(pv.head_verified ?? "").toUpperCase() === "YES" ||
    !!excoApproval;

  const isPaid = pv.status === "PAID";
  const financeRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
  const isFinanceExecPV = financeRoles.includes(pv.submitted_by_role ?? "");
  const isExcoPV = pv.submitted_by_role === "MINISTRY_HEAD";
  const showApplicantSig = !isFinanceExecPV && !isExcoPV;

  const isBamPV = pv.pv_type === "BAM";
  const bmApproval = approvals.find(a => a.role === "BUILDING_MANAGER");
  const committeeApproval = approvals.find(a => a.role === "BAM_COMMITTEE" && a.action === "APPROVED");
  const displayRef = pv.office_ref?.trim() || pv.pv_no;

  const itemRows = items.map((item, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${item.date ? esc(fmtDate(item.date)) : ""}</td>
      <td>${esc(item.description)}</td>
      <td class="r">${esc(fmt(Number(item.amount) || 0))}</td>
    </tr>`).join("");
  const padRowsHtml = Array.from({ length: padRows }).map(() => `
    <tr><td class="c">&nbsp;</td><td></td><td></td><td></td></tr>`).join("");

  // Office-use badge
  let officeBadge: string;
  if (isBamPV) {
    officeBadge = `<div class="ou-badge">BAM</div><div class="ou-badge-sub">(MAYBANK)</div>`;
  } else if (pv.pv_label) {
    officeBadge = `<div class="ou-badge">${esc(pv.pv_label.split(" - ")[0])}</div>`;
  } else {
    officeBadge = `<div class="ou-none">Not labelled</div>`;
  }

  // Mid section: BAM (raised/verified) OR (applicant + EXCO)
  let midSection = "";
  if (isBamPV) {
    midSection = `
      <div class="two-col">
        ${sigCell("Payment Raised by:", "(Building / Event Manager)", bmApproval?.signature_data, bmApproval?.name ?? pv.submitted_by ?? "", `Date: ${fmtDate(bmApproval?.timestamp ?? pv.submitted_at)}`)}
        ${sigCell("Verified by:", "(BAM Committee)", committeeApproval?.signature_data,
            committeeApproval ? (committeeApproval.name || committeeApproval.email) : null,
            committeeApproval ? `Date: ${fmtDate(committeeApproval.timestamp)}` : null,
            "Name: _______________  Date: _______")}
      </div>`;
  } else {
    const applicant = showApplicantSig
      ? sigCell("Applicant's Signature:", null, pv.applicant_signature_data,
          pv.sig_applicant_name || pv.applicant_name || null,
          `Date: ${fmtDate(pv.submitted_at)}`)
      : "";
    const exco = sigCell("Verified by:", "(By EXCO Member / Dept Head in Charge)", excoApproval?.signature_data,
        ministryVerified ? (excoApproval?.name ?? pv.ministry_verified_by ?? pv.dept_head_name ?? "EXCO Member") : null,
        ministryVerified ? `${pv.ministry}  Date: ${fmtDate(excoApproval?.timestamp ?? pv.ministry_verified_at ?? pv.head_verified_at)}` : null,
        "Name: _______________________  Date: ___________");
    midSection = `${applicant ? `<div class="one-col">${applicant}</div>` : ""}<div class="one-col">${exco}</div>`;
  }

  // Approved-by (signatory) columns
  const sigCols = Array.from({ length: loa.required }).map((_, i) => {
    const appr = sigApprovals[i];
    return `
      <div class="appr-col">
        <div class="sig-space center">${appr?.signature_data ? `<img src="${esc(appr.signature_data)}" alt="sig" />` : ""}</div>
        <div class="appr-foot">
          ${appr
            ? `<div class="sig-name">${esc(appr.name || appr.email)}</div><div class="sig-date">${esc(roleLabel(appr.role))}</div><div class="sig-date">Date: ${esc(fmtDate(appr.timestamp))}</div>`
            : `<div class="sig-pending">___________</div>`}
        </div>
      </div>`;
  }).join("");

  const remarks = approvals.filter(a => a.remarks);
  const remarksHtml = remarks.length
    ? `<div class="remarks"><div class="remarks-title">Remarks:</div>${remarks.map(a => `<div class="remark">${esc(roleLabel(a.role))} (${esc(a.name)}): ${esc(a.remarks)}</div>`).join("")}</div>`
    : "";

  // Attachments — every attachment stays visible on this page: images,
  // PDFs, and HTML documents (e.g. a signed worksheet, rendered the same
  // reliable way as this voucher itself) are all embedded directly; anything
  // else no browser can render inline gets a clearly labelled open-in-new-tab
  // link instead.
  const attachUrls = [...(pv.attachments ?? []), ...(pv.payment_receipt_url ? [pv.payment_receipt_url] : [])].filter(Boolean);
  const otherAtts = attachUrls.filter(u => !isImageUrl(u) && !isPdfUrl(u) && !isHtmlUrl(u));
  const attachHtml = attachUrls.length
    ? `
      <div class="attach-section">
        <div class="attach-title">Supporting Documents (${attachUrls.length})</div>
        ${otherAtts.length ? `<div class="attach-list">${otherAtts.map(u => `<div class="attach-link">📎 <a href="${esc(u)}" target="_blank" rel="noopener">${esc(fileName(u))}</a> <span class="attach-note">(open in new tab to view)</span></div>`).join("")}</div>` : ""}
      </div>
      ${attachUrls.filter(isImageUrl).map(u => `<div class="attach-page"><div class="attach-cap">Attachment — ${esc(fileName(u))}</div><img src="${esc(u)}" alt="attachment" /></div>`).join("")}
      ${attachUrls.filter(isPdfUrl).map(u => {
        const pages = pdfPages[u];
        // Rendered pages print properly; the iframe is the on-screen fallback.
        if (pages && pages.length) {
          return pages.map((p, i) => `<div class="attach-page"><div class="attach-cap">Attachment — ${esc(fileName(u))}${pages.length > 1 ? ` (page ${i + 1} of ${pages.length})` : ""}</div><img class="attach-pdf-page" src="${p.dataUri}" alt="attachment page" /></div>`).join("");
        }
        return `<div class="attach-page"><div class="attach-cap">Attachment — ${esc(fileName(u))} <a href="${esc(u)}" target="_blank" rel="noopener">(open in new tab)</a></div><iframe class="attach-pdf" src="${esc(u)}"></iframe></div>`;
      }).join("")}
      ${attachUrls.filter(isHtmlUrl).map(u => `<div class="attach-page"><div class="attach-cap">Attachment — ${esc(fileName(u))} <a href="${esc(u)}" target="_blank" rel="noopener">(open in new tab)</a></div><iframe class="attach-pdf" src="${esc(u)}"></iframe></div>`).join("")}`
    : "";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(pv.pv_no)} — Payment Voucher</title>
<style>
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #000; background: #f1f5f9; font-size: 12px; }
  .toolbar { position: sticky; top: 0; z-index: 5; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  .toolbar button { font: 600 13px Arial, sans-serif; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; }
  .btn-print { background: #173a72; color: #fff; }
  .btn-close { background: #e2e8f0; color: #334155; }
  .sheet { max-width: 820px; margin: 20px auto; background: #fff; padding: 34px 40px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .r { text-align: right; } .c { text-align: center; }
  .paid { display: flex; align-items: center; gap: 12px; border: 2px solid #16a34a; border-radius: 6px; background: #f0fdf4; padding: 8px 12px; margin-bottom: 10px; }
  .paid-stamp { border: 3px solid #16a34a; border-radius: 4px; padding: 4px 12px; transform: rotate(-8deg); font-size: 19px; font-weight: 700; color: #16a34a; letter-spacing: 3px; }
  .paid-title { font-weight: 700; color: #166534; }
  .paid-line { color: #15803d; font-size: 11px; margin-top: 1px; }
  .head { display: flex; gap: 10px; margin-bottom: 8px; }
  .head-org { flex: 1; display: flex; gap: 8px; }
  .head-org img { width: 50px; height: 50px; }
  .org-name { font-size: 14px; font-weight: 700; }
  .org-line { font-size: 10px; color: #555; }
  .office-use { width: 150px; border: 1px solid #000; padding: 6px 8px; text-align: center; }
  .ou-title { font-weight: 700; font-size: 10px; border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 3px; }
  .ou-badge { font-weight: 700; font-size: 20px; letter-spacing: 1px; }
  .ou-badge-sub { font-size: 10px; border-top: 1px solid #000; padding-top: 2px; margin-top: 2px; }
  .ou-none { font-size: 10px; color: #bbb; font-style: italic; }
  .ou-ref { font-size: 10px; margin-top: 4px; text-align: left; }
  .title-main { text-align: center; font-weight: 700; font-size: 13px; margin-bottom: 1px; }
  .title-sub { text-align: center; font-size: 12px; margin-bottom: 6px; }
  table.grid { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .info { border: 1px solid #000; margin-bottom: 6px; }
  .info-row { display: flex; }
  .info-cell { padding: 4px 6px; border: 1px solid #000; flex: 1; font-size: 11px; }
  .info-cell b { font-weight: 700; }
  .exco-ref { background: #fef3c7; font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  table.items th, table.items td { border: 1px solid #000; padding: 4px 6px; font-size: 11px; }
  table.items th { background: #f0f0f0; text-align: left; }
  table.items th.r, table.items td.r { text-align: right; }
  table.items th.c, table.items td.c { text-align: center; }
  .two-col { display: flex; margin-bottom: 6px; }
  .two-col .sig-cell:first-child { border-right: none; }
  .one-col { margin-bottom: 6px; }
  .sig-cell { flex: 1; border: 1px solid #000; padding: 6px 8px; }
  .sig-head { border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px; }
  .sig-label { font-weight: 700; font-size: 10px; }
  .sig-sub { font-size: 10px; color: #555; }
  .sig-space { height: 46px; display: flex; align-items: flex-end; }
  .sig-space.center { justify-content: center; }
  .sig-space img { max-height: 44px; max-width: 100%; object-fit: contain; }
  .sig-foot { border-top: 1px solid #000; padding-top: 3px; }
  .sig-name { font-weight: 700; font-size: 10px; }
  .sig-date { font-size: 10px; }
  .sig-pending { font-size: 10px; color: #999; }
  .fin-header { background: #000; color: #fff; text-align: center; font-weight: 700; font-size: 11px; padding: 3px; margin-top: 8px; }
  .fin-row { display: flex; border: 1px solid #000; border-top: none; }
  .fin-col { flex: 1; border-right: 1px solid #000; padding: 6px 8px; }
  .fin-col:last-child { border-right: none; }
  .fin-col .sig-cell { border: none; padding: 0; }
  .appr-head { border-bottom: 1px solid #000; padding-bottom: 2px; margin-bottom: 4px; }
  .appr-cols { display: flex; gap: 6px; }
  .appr-col { flex: 1; text-align: center; }
  .appr-foot { border-top: 1px solid #000; padding-top: 3px; }
  .remarks { margin-top: 6px; }
  .remarks-title { font-weight: 700; font-size: 10px; margin-bottom: 2px; }
  .remark { font-size: 10px; }
  .attach-section { margin-top: 14px; padding: 10px 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 5px; }
  .attach-title { font-weight: 700; font-size: 11px; margin-bottom: 4px; }
  .attach-list { font-size: 11px; }
  .attach-link { margin-top: 2px; }
  .attach-link a { color: #1d4ed8; }
  .attach-note { color: #6b7280; font-size: 10px; }
  .attach-page { page-break-before: always; margin-top: 16px; }
  .attach-cap { font-size: 10px; color: #555; margin-bottom: 6px; }
  .attach-cap a { color: #1d4ed8; margin-left: 6px; }
  .attach-page img { max-width: 100%; max-height: 1000px; object-fit: contain; border: 1px solid #ddd; display: block; margin: 0 auto; }
  .attach-pdf { width: 100%; height: 900px; border: 1px solid #ddd; }
  /* A rasterized PDF page is an ordinary image, so it prints in full — one
     attachment page per sheet, scaled to fit without cropping. */
  .attach-pdf-page { width: 100%; max-width: 100%; height: auto; border: 1px solid #ddd; display: block; margin: 0 auto; }
  @media print {
    .attach-pdf { height: 1100px; }
    .attach-pdf-page { border: none; max-height: 100vh; width: auto; max-width: 100%; }
  }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { max-width: none; margin: 0; box-shadow: none; padding: 0; }
    @page { margin: 10mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    ${isPaid ? paidBanner(pv) : ""}

    <div class="head">
      <div class="head-org">
        ${logoDataUri ? `<img src="${esc(logoDataUri)}" alt="" />` : ""}
        <div>
          <div class="org-name">LUTHERAN CHURCH IN MALAYSIA</div>
          <div class="org-line">(ROS: PPM-001-10-09031964)</div>
          <div class="org-line">Luther Centre, No. 6, Jalan Utara, 46200 Petaling Jaya, Selangor</div>
          <div class="org-line">Tel: 03-7956 5992  Fax: 03-7957 6953  Email: finance@lcm.org.my</div>
        </div>
      </div>
      <div class="office-use">
        <div class="ou-title">FOR OFFICE USE ONLY</div>
        ${officeBadge}
        <div class="ou-ref">Ref: <b>${esc(displayRef)}</b></div>
        <div class="ou-ref">A/C Code: <b>${esc(pv.accounting_code ?? "")}</b></div>
      </div>
    </div>

    <div class="title-main">LUTHERAN CHURCH IN MALAYSIA</div>
    <div class="title-sub">(REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER)</div>

    <div class="info">
      <div class="info-row">
        <div class="info-cell" style="flex:2">Applicant:  <b>${esc(pv.applicant_name || pv.submitted_by)}</b></div>
        <div class="info-cell">Date:  <b>${esc(fmtDate(pv.date ?? pv.submitted_at))}</b></div>
      </div>
      <div class="info-cell">Payable to:  <b>${esc(pv.payee_name)}</b></div>
      <div class="info-cell">Payee Bank A/C No:  ${esc(bankLine)}</div>
      <div class="info-cell">Project:  ${esc(projectLabel)}</div>
      <div class="info-cell">Purpose:  ${esc(pv.purpose)}</div>
      ${pv.reference_pv_no ? `<div class="info-cell exco-ref">Ref. earlier PV: <b>${esc(pv.reference_pv_no)}</b>${pv.reference_note ? ` — ${esc(pv.reference_note)}` : ""}</div>` : ""}
      ${pv.exco_resolution_ref ? `<div class="info-cell exco-ref">EXCO Resolution Ref: ${esc(pv.exco_resolution_ref)}${pv.exco_resolution_date ? `  dated ${esc(pv.exco_resolution_date)}` : ""}</div>` : ""}
    </div>

    <table class="items">
      <thead><tr><th class="c" style="width:24px">#</th><th style="width:75px">Date</th><th>PARTICULARS</th><th class="r" style="width:90px">Amount (RM)</th></tr></thead>
      <tbody>
        ${itemRows}${padRowsHtml}
        <tr><td colspan="3" class="r"><b>Total:</b></td><td class="r"><b>RM ${esc(fmt(total))}</b></td></tr>
      </tbody>
    </table>

    ${midSection}

    <div class="fin-header">FOR LCM FINANCE OFFICE ONLY</div>
    <div class="fin-row">
      <div class="fin-col">${sigCell(isBamPV ? "Reviewed by:" : "Prepared by:", "(Finance Executive)", financeApproval?.signature_data, financeApproval?.name || null, financeApproval ? `Date: ${fmtDate(financeApproval.timestamp)}` : null)}</div>
      <div class="fin-col">${sigCell("Verified by:", "(General Manager)", gmApproval?.signature_data, gmApproval?.name || null, gmApproval ? `Date: ${fmtDate(gmApproval.timestamp)}` : null)}</div>
      <div class="fin-col">
        <div class="appr-head"><div class="sig-label">Approved by:</div><div class="sig-sub">(Bishop / Secretary / Treasurer)</div></div>
        <div class="appr-cols">${sigCols}</div>
      </div>
    </div>

    ${remarksHtml}
    ${isPaid ? paidBanner(pv) : ""}
    ${attachHtml}
  </div>
</body>
</html>`;
}
