"use client";
// Bank payment file export — maps a finalized payroll run into the bank's
// upload template (columns A–J). Account and ID numbers are written as TEXT
// cells so leading zeros survive; the on-screen preview is masked because
// full account and IC numbers are confidential.
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { logPayrollAudit } from "@/lib/payroll/audit";
import { X, FileSpreadsheet, AlertTriangle, Download, CheckCircle2, Loader2 } from "lucide-react";
import type { PayrollEmployee, PayrollLine } from "@/lib/types";

// SWIFT/BIC codes for the bank dropdown values used on employee records.
const BANK_BIC: Record<string, string> = {
  "Maybank": "MBBEMYKL",
  "CIMB Bank": "CIBBMYKL",
  "Public Bank": "PBBEMYKL",
  "RHB Bank": "RHBBMYKL",
  "Hong Leong Bank": "HLBBMYKL",
  "AmBank": "ARBKMYKL",
  "Bank Islam": "BIMBMYKL",
  "Bank Rakyat": "BKRMMYKL",
  "Affin Bank": "PHBMMYKL",
  "Alliance Bank": "MFBBMYKL",
  "Bank Simpanan Nasional (BSN)": "BSNAMYK1",
  "OCBC Bank": "OCBCMYKL",
  "HSBC Bank": "HBMBMYKL",
  "Standard Chartered": "SCBLMYKX",
  "UOB Bank": "UOVBMYKL",
  "Bank Muamalat": "BMMBMYKL",
  "Agrobank": "AGOBMYKL",
  "MBSB Bank": "MBSBMYKL",
};

// The paying account is with Public Bank — intrabank transfers use PBB mode,
// everything else goes out as IBG.
const HOME_BANK = "Public Bank";

export interface BankExportRow {
  mode: string;
  account: string;   // digits only, leading zeros preserved
  bic: string;
  name: string;
  idType: string;    // NI = NRIC (intrabank & IBG); PP = passport
  idNo: string;
  amount: number;    // net pay, 2dp
  reference: string;
  otherDetails: string;
  email: string;
  problems: string[]; // validation issues — row excluded when non-empty
}

function digitsOnly(s: string): string { return (s ?? "").replace(/\D/g, ""); }
function maskTail(s: string, visible = 4): string {
  if (!s) return "—";
  return s.length <= visible ? "*".repeat(s.length) : "*".repeat(s.length - visible) + s.slice(-visible);
}

export function buildBankRows(lines: PayrollLine[], empById: Record<string, PayrollEmployee>): BankExportRow[] {
  return lines.map(l => {
    const emp = empById[l.employee_id];
    const problems: string[] = [];
    const bankName = emp?.bank_name ?? "";
    const account = digitsOnly(emp?.bank_acct ?? "");
    const ic = digitsOnly(emp?.ic_no ?? "");
    if (!emp) problems.push("employee record missing");
    if (!bankName) problems.push("no bank name");
    if (!account) problems.push("no account number");
    if (!ic) problems.push("no IC number");
    if (bankName && !BANK_BIC[bankName]) problems.push(`no BIC mapping for "${bankName}"`);
    const net = Number(l.net);
    if (!(net > 0)) problems.push("net pay is zero");
    return {
      mode: bankName === HOME_BANK ? "PBB" : "IBG",
      account,
      bic: BANK_BIC[bankName] ?? "",
      name: (l.employee_name || emp?.full_name || "").toUpperCase(),
      idType: "NI",
      idNo: ic,
      amount: Math.round(net * 100) / 100,
      reference: "SALARY",
      otherDetails: "LCM",
      email: emp?.email ?? "",
      problems,
    };
  });
}

async function generateWorkbook(rows: BankExportRow[]): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Payment");

  ws.columns = [
    { width: 14 }, { width: 22 }, { width: 13 }, { width: 32 }, { width: 16 },
    { width: 20 }, { width: 16 }, { width: 20 }, { width: 20 }, { width: 30 },
  ];

  // Row 1 — column titles (red, like the bank template)
  const titles = [
    "Mode :\nPBB/IBG/RENTAS", "Bene Account No.", "BIC", "Bene Full Name",
    "For Intrabank & IBG\nNI, OI, BR, PL, ML, PP", "Passport",
    "Payment Amount\n(2 decimal points)", "Recipient Reference", "Other Payment Details", "Bene Email 1",
  ];
  const r1 = ws.addRow(titles);
  r1.height = 30;
  r1.eachCell(c => {
    c.font = { color: { argb: "FFFF0000" }, bold: true, size: 9 };
    c.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  // Row 2 — (M)/(O) character specs (yellow fill)
  const specs = [
    "(M) - Char: 3 - A", "(M) - Char: 20 - N", "(M) - Char: 11 - AN", "(M) - Char: 120 - AN",
    "(O) - Char: 2 - A", "(O) - Char: 29 - AN", "(M) - Char: 18 - N", "(M) - Char: 20 - AN",
    "(O) - Char: 20 - AN", "(O) - Char: 70 - AN",
  ];
  const r2 = ws.addRow(specs);
  r2.eachCell(c => {
    c.font = { bold: true, size: 9 };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  // Data rows — account & IC as explicit text cells to keep leading zeros.
  for (const row of rows) {
    const r = ws.addRow([
      row.mode, row.account, row.bic, row.name, row.idType,
      row.idNo, row.amount, row.reference, row.otherDetails, row.email,
    ]);
    r.getCell(2).numFmt = "@";
    r.getCell(2).value = row.account; // string value + text format
    r.getCell(6).numFmt = "@";
    r.getCell(6).value = row.idNo;
    r.getCell(7).numFmt = "0.00";
    r.eachCell(c => { c.font = { size: 10 }; });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function BankExportModal({ runId, periodLabel, lines, empById, onClose, onStored }: {
  runId: string;
  periodLabel: string;   // e.g. "August 2026"
  lines: PayrollLine[];
  empById: Record<string, PayrollEmployee>;
  onClose: () => void;
  onStored: () => void;
}) {
  const supabase = createClient();
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState<{ fileName: string; path: string } | null>(null);
  const [error, setError] = useState("");

  const rows = buildBankRows(lines, empById);
  const valid = rows.filter(r => r.problems.length === 0);
  const invalid = rows.filter(r => r.problems.length > 0);
  const total = valid.reduce((s, r) => s + r.amount, 0);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      const blob = await generateWorkbook(valid);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const fileName = `PBB_Payroll_${periodLabel.replace(/\s+/g, "")}_${stamp}.xlsx`;
      const path = `bank-exports/${runId}/${Date.now()}_${fileName}`;
      // store under the run first (private bucket), then hand the file to the user
      const { error: upErr } = await supabase.storage.from("employee-docs")
        .upload(path, blob, { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      if (upErr) throw new Error(`Could not store the export: ${upErr.message}`);
      await logPayrollAudit(supabase, {
        action: "BANK_EXPORT", entity: periodLabel,
        detail: `${fileName} — ${valid.length} payments, RM ${total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}${invalid.length ? `, ${invalid.length} excluded` : ""}`,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fileName; a.click();
      URL.revokeObjectURL(url);
      setDone({ fileName, path });
      onStored();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 shrink-0">
          <h2 className="text-base font-bold text-stone-800 flex items-center gap-2">
            <FileSpreadsheet size={17} className="text-green-600" /> Bank Payment File — {periodLabel}
          </h2>
          <button onClick={onClose} className="p-1 text-stone-400 hover:text-stone-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

          {done ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                <CheckCircle2 size={26} className="text-green-600" />
              </div>
              <p className="text-base font-bold text-stone-800">Excel bank file generated</p>
              <p className="text-sm font-mono text-[#4a6da7] mt-1">{done.fileName}</p>
              <p className="text-xs text-stone-400 mt-3 max-w-sm mx-auto">
                The file has downloaded and a copy is stored under this payroll run’s Bank Exports.
                {valid.length} row{valid.length !== 1 ? "s" : ""} · RM {total.toLocaleString("en-MY", { minimumFractionDigits: 2 })} total.
              </p>
            </div>
          ) : (
            <>
              {/* Validation issues */}
              {invalid.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
                  <p className="text-sm font-semibold text-amber-800 flex items-center gap-1.5 mb-1.5">
                    <AlertTriangle size={14} /> {invalid.length} employee{invalid.length > 1 ? "s" : ""} will be excluded
                  </p>
                  <ul className="text-xs text-amber-700 space-y-0.5">
                    {invalid.map((r, i) => (
                      <li key={i}><span className="font-semibold">{r.name || "Unknown"}</span> — {r.problems.join(", ")}</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-600 mt-1.5">Fix the employee records, or pay these staff manually.</p>
                </div>
              )}

              {/* Masked preview */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">
                  Preview — account &amp; IC numbers masked on screen
                </p>
                <div className="overflow-x-auto rounded-lg border border-stone-200">
                  <table className="w-full text-[11px] border-collapse" style={{ minWidth: 640 }}>
                    <thead>
                      <tr className="bg-stone-100 text-stone-600">
                        <th className="px-2 py-1.5 text-left">Mode</th>
                        <th className="px-2 py-1.5 text-left">Account No.</th>
                        <th className="px-2 py-1.5 text-left">BIC</th>
                        <th className="px-2 py-1.5 text-left">Beneficiary</th>
                        <th className="px-2 py-1.5 text-left">ID</th>
                        <th className="px-2 py-1.5 text-right">Amount (RM)</th>
                        <th className="px-2 py-1.5 text-left">Ref</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {valid.map((r, i) => (
                        <tr key={i} className="odd:bg-stone-50/50">
                          <td className="px-2 py-1"><span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600">{r.mode}</span></td>
                          <td className="px-2 py-1 font-mono">{maskTail(r.account)}</td>
                          <td className="px-2 py-1 font-mono">{r.bic}</td>
                          <td className="px-2 py-1 font-medium text-stone-700">{r.name}</td>
                          <td className="px-2 py-1 font-mono">{r.idType} {maskTail(r.idNo)}</td>
                          <td className="px-2 py-1 text-right font-mono font-semibold">{r.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                          <td className="px-2 py-1 text-stone-500">{r.reference}</td>
                        </tr>
                      ))}
                      <tr className="bg-[#4a6da7]/10 font-bold text-[#4a6da7]">
                        <td className="px-2 py-1.5" colSpan={5}>TOTAL — {valid.length} payment{valid.length !== 1 ? "s" : ""}</td>
                        <td className="px-2 py-1.5 text-right font-mono">{total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-stone-400 mt-2">
                  The Excel file contains the full unmasked details in the bank’s A–J template. Account and IC
                  numbers are written as text so leading zeros are preserved exactly.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-stone-200 shrink-0">
          {done ? (
            <button onClick={onClose} className="flex-1 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f]">
              Return to payroll run
            </button>
          ) : (
            <>
              <button onClick={generate} disabled={generating || valid.length === 0}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-[#4a6da7] text-white rounded-xl text-sm font-semibold hover:bg-[#3d5c8f] disabled:opacity-50">
                {generating ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
                {generating ? "Generating…" : `Generate & Download (${valid.length} payments)`}
              </button>
              <button onClick={onClose} className="px-5 py-2.5 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50">Cancel</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
