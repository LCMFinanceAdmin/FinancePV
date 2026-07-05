import type { WorkerWorksheet } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

const WORKER_TYPE_LABEL: Record<string, string> = {
  PA_PERSONNEL: "PA Personnel",
  BUILDING_CARE_TAKER: "Building Care Taker",
  RELA_PERSONNEL: "RELA Personnel",
};

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function generateWorksheetPdfBlob(ws: WorkerWorksheet): Promise<Blob> {
  const entriesRows = ws.entries
    .map(
      (e, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${esc(e.date)}</td>
        <td>${esc(e.start_time)}</td>
        <td>${esc(e.end_time)}</td>
        <td>${Number(e.hours).toFixed(2)}</td>
        <td>${esc(e.purpose)}</td>
      </tr>`
    )
    .join("");

  const workerSigHtml = ws.worker_signature
    ? `<img src="${ws.worker_signature}" style="max-height:60px;max-width:160px;" />`
    : '<span style="color:#aaa">Not signed</span>';

  const bemSigHtml = ws.bem_signature
    ? `<img src="${ws.bem_signature}" style="max-height:60px;max-width:160px;" />`
    : '<span style="color:#aaa">Not signed</span>';

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Worksheet ${esc(ws.worksheet_no)}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; margin: 32px; color: #111; }
  h1 { font-size: 16px; margin-bottom: 4px; }
  .sub { color: #555; margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin-bottom: 20px; }
  .info-item label { font-weight: 600; display: block; color: #555; font-size: 10px; text-transform: uppercase; }
  .total-row { font-weight: bold; background: #f9fafb; }
  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  .sig-box { border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; }
  .sig-box label { font-weight: 600; font-size: 11px; color: #555; margin-bottom: 8px; display: block; }
</style>
</head>
<body>
<h1>BAM Worker Worksheet</h1>
<div class="sub">Worksheet No: <strong>${esc(ws.worksheet_no)}</strong></div>

<div class="info-grid">
  <div class="info-item"><label>Worker Type</label>${esc(WORKER_TYPE_LABEL[ws.worker_type] ?? ws.worker_type)}</div>
  <div class="info-item"><label>Worker Name</label>${esc(ws.worker_name)}</div>
  <div class="info-item"><label>Bank</label>${esc(ws.bank_name)}</div>
  <div class="info-item"><label>Account No</label>${esc(ws.bank_account_no)}</div>
  <div class="info-item"><label>Period</label>${esc(ws.period_label)}</div>
  <div class="info-item"><label>Rate</label>${formatCurrency(ws.rate_per_hour)} / ${ws.period_type === "MONTH" ? "month" : "session"}</div>
</div>

<table>
  <thead>
    <tr>
      <th>#</th><th>Date</th><th>Start</th><th>End</th><th>Hours</th><th>Purpose</th>
    </tr>
  </thead>
  <tbody>
    ${entriesRows}
    <tr class="total-row">
      <td colspan="4" style="text-align:right">Total</td>
      <td>${Number(ws.total_hours).toFixed(2)}</td>
      <td>${formatCurrency(ws.total_amount)}</td>
    </tr>
  </tbody>
</table>

${ws.notes ? `<p><strong>Notes:</strong> ${esc(ws.notes)}</p>` : ""}

<div class="sig-grid">
  <div class="sig-box">
    <label>Worker&apos;s Signature</label>
    ${workerSigHtml}
    ${ws.worker_signed_at ? `<div style="font-size:10px;color:#888;margin-top:4px;">${new Date(ws.worker_signed_at).toLocaleString("en-MY")}</div>` : ""}
  </div>
  <div class="sig-box">
    <label>Verified by BEM</label>
    ${bemSigHtml}
    ${ws.bem_signed_by ? `<div style="font-size:10px;color:#888;margin-top:4px;">${esc(ws.bem_signed_by)}${ws.bem_signed_at ? " · " + new Date(ws.bem_signed_at).toLocaleString("en-MY") : ""}</div>` : ""}
  </div>
</div>
</body>
</html>`;

  return new Blob([html], { type: "text/html" });
}
