import type { WorkerWorksheet } from "@/lib/types";

// HTML-based worksheet rendering. This deliberately replaces the react-pdf
// path for viewing: react-pdf's flexbox/image layout proved fragile and
// context-dependent for the signature area (an <Image> in a flex column
// could get a corrupt placement matrix depending on surrounding nodes),
// whereas an ordinary HTML <img> renders reliably in every browser. The
// user prints or "Save as PDF" from the browser's own print dialog, which
// produces a clean, high-fidelity PDF with the signatures always intact.

const WORKER_TYPE_LABEL: Record<string, string> = {
  PA_PERSONNEL: "PA Personnel",
  BUILDING_CARE_TAKER: "Building Care Taker",
  RELA_PERSONNEL: "RELA Personnel",
};

const ACCENT = "#4a6da7";

function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmtMoney(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtDate(sVal?: string | null): string {
  if (!sVal) return "";
  const d = new Date(sVal);
  if (isNaN(d.getTime())) return sVal.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtDateTime(sVal?: string | null): string {
  if (!sVal) return "";
  const d = new Date(sVal);
  if (isNaN(d.getTime())) return "";
  return `${fmtDate(sVal)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function sigBlock(label: string, signature: string | null, signedBy: string | null, signedAt: string | null): string {
  return `
    <div class="sig">
      <div class="sig-label">${esc(label)}</div>
      <div class="sig-space">
        ${signature ? `<img src="${esc(signature)}" alt="signature" />` : ""}
      </div>
      <div class="sig-meta">
        ${signedBy
          ? `<div class="sig-name">${esc(signedBy)}</div><div class="sig-date">${signedAt ? `Signed: ${esc(fmtDateTime(signedAt))}` : ""}</div>`
          : `<div class="sig-pending">Pending signature</div>`}
      </div>
    </div>`;
}

export function worksheetPrintHtml(ws: WorkerWorksheet, logoDataUri = ""): string {
  const rateLabel = ws.worker_type === "PA_PERSONNEL" || ws.worker_type === "RELA_PERSONNEL"
    ? "Rate per Session (RM)" : "Rate per Hour (RM)";
  const statusBg = ws.status === "SIGNED" ? "#dcfce7" : ws.status === "PV_RAISED" ? "#dbeafe" : "#f3f4f6";
  const statusColor = ws.status === "SIGNED" ? "#15803d" : ws.status === "PV_RAISED" ? "#1d4ed8" : "#4b5563";

  const rows = ws.entries.map((e) => `
    <tr>
      <td>${esc(fmtDate(e.date))}</td>
      <td>${e.start_time && e.end_time ? `${esc(e.start_time)}–${esc(e.end_time)}` : "—"}</td>
      <td class="right">${esc(e.hours)}</td>
      <td>${esc(e.purpose || "")}</td>
    </tr>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(ws.worksheet_no)} — Worksheet</title>
<style>
  :root { --accent: ${ACCENT}; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; background: #f1f5f9; }
  .toolbar { position: sticky; top: 0; display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; background: #fff; border-bottom: 1px solid #e2e8f0; }
  .toolbar button { font: 600 13px Arial, sans-serif; border: none; border-radius: 8px; padding: 9px 18px; cursor: pointer; }
  .btn-print { background: var(--accent); color: #fff; }
  .btn-close { background: #e2e8f0; color: #334155; }
  .sheet { max-width: 800px; margin: 20px auto; background: #fff; padding: 40px 44px; box-shadow: 0 2px 12px rgba(0,0,0,.08); }
  .head { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; margin-bottom: 18px; border-bottom: 2px solid var(--accent); }
  .head-left { display: flex; align-items: center; gap: 12px; }
  .head-left img { width: 46px; height: 46px; }
  .org { font-size: 16px; font-weight: 700; color: var(--accent); }
  .subtitle { font-size: 11px; color: #6b7280; margin-top: 2px; }
  .ws-no { font-size: 15px; font-weight: 700; text-align: right; }
  .status { display: inline-block; margin-top: 4px; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 9px; background: ${statusBg}; color: ${statusColor}; }
  .cards { display: flex; gap: 12px; margin-bottom: 18px; }
  .card { flex: 1; padding: 9px 12px; background: #f8fafc; border-radius: 5px; }
  .card-label { font-size: 10px; color: #6b7280; }
  .card-value { font-size: 12px; font-weight: 700; margin-top: 2px; }
  table.entries { width: 100%; border-collapse: collapse; border: 1px solid #1f2937; margin-bottom: 14px; }
  table.entries th { background: var(--accent); color: #fff; font-size: 10px; text-align: left; padding: 6px 9px; border-right: 1px solid #7b98c9; }
  table.entries th:last-child { border-right: none; }
  table.entries td { font-size: 10px; padding: 6px 9px; border-top: 1px solid #1f2937; border-right: 1px solid #1f2937; }
  table.entries td:last-child { border-right: none; }
  table.entries .right { text-align: right; }
  .summary { display: flex; justify-content: flex-end; margin-bottom: 18px; }
  .summary-box { width: 46%; border: 1px solid #1f2937; border-radius: 4px; overflow: hidden; }
  .summary-row { display: flex; justify-content: space-between; padding: 6px 10px; font-size: 11px; border-bottom: 1px solid #e5e7eb; }
  .summary-row.total { background: #f8fafc; border-bottom: none; font-weight: 700; font-size: 12px; }
  .summary-row.total .amt { color: var(--accent); }
  .summary-row b { font-weight: 700; }
  .confirm { font-size: 10px; color: #6b7280; margin-bottom: 8px; }
  .sigs { display: flex; border: 1px solid #1f2937; border-radius: 4px; }
  .sig { flex: 1; padding: 10px 12px; }
  .sig:first-child { border-right: 1px solid #1f2937; }
  .sig-label { font-size: 10px; font-weight: 700; padding-bottom: 3px; margin-bottom: 6px; border-bottom: 1px solid #1f2937; }
  .sig-space { height: 64px; display: flex; align-items: flex-end; }
  .sig-space img { max-height: 62px; max-width: 100%; object-fit: contain; }
  .sig-meta { border-top: 1px solid #1f2937; padding-top: 4px; margin-top: 2px; }
  .sig-name { font-size: 10px; font-weight: 700; }
  .sig-date { font-size: 9px; color: #6b7280; }
  .sig-pending { font-size: 9px; color: #6b7280; }
  .notes { margin-bottom: 16px; }
  .notes-label { font-size: 10px; color: #6b7280; }
  .notes-body { font-size: 11px; margin-top: 2px; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .sheet { max-width: none; margin: 0; box-shadow: none; padding: 0; }
    @page { margin: 14mm; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <button class="btn-print" onclick="window.print()">🖨 Print / Save as PDF</button>
    <button class="btn-close" onclick="window.close()">Close</button>
  </div>
  <div class="sheet">
    <div class="head">
      <div class="head-left">
        ${logoDataUri ? `<img src="${esc(logoDataUri)}" alt="" />` : ""}
        <div>
          <div class="org">Lutheran Church in Malaysia</div>
          <div class="subtitle">Building / Event Management — Extra Worker Worksheet</div>
        </div>
      </div>
      <div>
        <div class="ws-no">${esc(ws.worksheet_no)}</div>
        <div style="text-align:right"><span class="status">${esc(ws.status.replace(/_/g, " "))}</span></div>
      </div>
    </div>

    <div class="cards">
      <div class="card"><div class="card-label">Worker Type</div><div class="card-value">${esc(WORKER_TYPE_LABEL[ws.worker_type] ?? ws.worker_type)}</div></div>
      <div class="card"><div class="card-label">Worker Name</div><div class="card-value">${esc(ws.worker_name)}</div></div>
      <div class="card"><div class="card-label">Period</div><div class="card-value">${esc(ws.period_label)}</div></div>
    </div>

    <table class="entries">
      <thead><tr><th>Date</th><th>Time</th><th class="right">Hours</th><th>Purpose / Remarks</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="summary">
      <div class="summary-box">
        <div class="summary-row"><span>Total Hours</span><b>${esc(ws.total_hours)}</b></div>
        <div class="summary-row"><span>${esc(rateLabel)}</span><b>${esc(fmtMoney(ws.rate_per_hour))}</b></div>
        <div class="summary-row total"><span>Total Amount (RM)</span><span class="amt">${esc(fmtMoney(ws.total_amount))}</span></div>
      </div>
    </div>

    ${ws.notes ? `<div class="notes"><div class="notes-label">Notes</div><div class="notes-body">${esc(ws.notes)}</div></div>` : ""}

    <div class="confirm">I/We confirm the hours worked and amount stated above are true and correct.</div>
    <div class="sigs">
      ${sigBlock("Worker's Signature", ws.worker_signature, ws.worker_name, ws.worker_signed_at)}
      ${sigBlock("Verified by — Building/Event Manager", ws.bem_signature, ws.bem_signed_by, ws.bem_signed_at)}
    </div>
  </div>
</body>
</html>`;
}
