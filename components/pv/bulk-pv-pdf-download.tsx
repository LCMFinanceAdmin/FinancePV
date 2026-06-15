"use client";
import { useState, useEffect } from "react";
import { Printer, Eye, Download, X } from "lucide-react";
import type { PV, PVApproval, BulkRun } from "@/lib/types";
import {
  pdf, Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";
import { PDFDocument } from "pdf-lib";
import { PVDocument, fetchBytes, svgToPngDataUri } from "./pv-pdf-download";

// ── Helpers ───────────────────────────────────────────────────────────────
function fmtDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmt(n: number): string {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB", "public bank": "PBB",
  "rhb": "RHB", "hong leong bank": "HLB", "ambank": "AMB", "bank islam": "BIMB",
  "bank rakyat": "BPR", "ocbc": "OCBC", "standard chartered": "SCB",
  "affin bank": "AFFIN", "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};

// ── Styles ────────────────────────────────────────────────────────────────
const st = StyleSheet.create({
  page:    { fontFamily: "Helvetica", fontSize: 9, padding: "10mm", color: "#000" },
  row:     { flexDirection: "row" },
  bold:    { fontFamily: "Helvetica-Bold" },
  border:  { border: "1pt solid #000" },
  borderT: { borderTop: "1pt solid #000" },
  hdrBg:   { backgroundColor: "#f0f0f0" },
  center:  { textAlign: "center" },
  tiny:    { fontSize: 7 },
  small:   { fontSize: 8 },
});

// ── Batch Summary Page (landscape A4, matches HTML layout) ───────────────
function BatchSummaryDocument({
  run, pvs, finSigData, runByName, logoDataUri,
}: {
  run: BulkRun; pvs: PV[]; finSigData: string; runByName: string; logoDataUri?: string;
}) {
  const year       = new Date(run.run_date).getFullYear();
  const batchRef   = `BATCH-${year}-${run.id.slice(-6).toUpperCase()}`;
  const grandTotal = pvs.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  // Landscape A4: ~841pt wide. With 8mm padding each side (~22.7pt), usable ≈ 796pt.
  // Columns: 18 + 68 + 160 + 80 + 115 + 70 + 142.5 + 142.5 = 796pt
  const COL = { num: 18, pvno: 68, payee: 160, bank: 80, acct: 115, amt: 70, sig: 142.5 };

  return (
    <Document title={`Batch ${run.group_name}`}>
      <Page size="A4" orientation="landscape" style={[st.page, { padding: "8mm" }]}>

        {/* ── Header: logo + centered title + office-use box ── */}
        <View style={[st.row, { marginBottom: 6, alignItems: "flex-start" }]}>
          {/* Logo left */}
          <View style={{ width: 50 }}>
            {logoDataUri
              ? <Image src={logoDataUri} style={{ width: 44, height: 44 }} />
              : null}
          </View>
          {/* Centered titles */}
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={[st.bold, { fontSize: 13 }]}>
              LUTHERAN CHURCH IN MALAYSIA — BATCH PAYMENT SUMMARY
            </Text>
          </View>
          {/* Office-use box right */}
          <View style={[st.border, { width: 145, marginLeft: 8 }]}>
            <View style={{ padding: "3pt 6pt", borderBottom: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>For Office Use Only:</Text>
            </View>
            <View style={{ padding: "3pt 6pt", borderBottom: "1pt solid #000" }}>
              <Text style={st.tiny}><Text style={st.bold}>Batch Ref: </Text>{batchRef}</Text>
            </View>
            <View style={{ padding: "3pt 6pt" }}>
              <Text style={st.tiny}><Text style={st.bold}>Group: </Text>{run.group_name}</Text>
            </View>
          </View>
        </View>

        {/* ── Info rows ── */}
        <View style={{ marginBottom: 6 }}>
          <View style={[st.row, { marginBottom: 3 }]}>
            <Text style={[st.bold, { width: 130, fontSize: 8 }]}>Group:</Text>
            <View style={{ flex: 1, borderBottom: "1pt solid #555" }}>
              <Text style={[st.bold, { fontSize: 8 }]}>{run.group_name}</Text>
            </View>
            <Text style={[st.bold, { width: 100, fontSize: 8, marginLeft: 24 }]}>Run Date:</Text>
            <View style={{ flex: 1, borderBottom: "1pt solid #555" }}>
              <Text style={{ fontSize: 8 }}>{fmtDate(run.run_date)}</Text>
            </View>
          </View>
          <View style={[st.row, { marginBottom: run.ministry ? 3 : 0 }]}>
            <Text style={[st.bold, { width: 130, fontSize: 8 }]}>Prepared by:</Text>
            <View style={{ flex: 1, borderBottom: "1pt solid #555" }}>
              <Text style={{ fontSize: 8 }}>{runByName || run.run_by}</Text>
            </View>
            <Text style={[st.bold, { width: 100, fontSize: 8, marginLeft: 24 }]}>No. of PVs:</Text>
            <View style={{ flex: 1, borderBottom: "1pt solid #555" }}>
              <Text style={[st.bold, { fontSize: 8 }]}>
                {run.pv_count} voucher{run.pv_count !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          {run.ministry ? (
            <View style={st.row}>
              <Text style={[st.bold, { width: 130, fontSize: 8 }]}>Ministry:</Text>
              <View style={{ flex: 1, borderBottom: "1pt solid #555" }}>
                <Text style={{ fontSize: 8 }}>{run.ministry}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Section heading ── */}
        <Text style={[st.bold, { fontSize: 9, marginBottom: 3 }]}>
          Payment Details — Individual Transactions
        </Text>

        {/* ── Payment table ── */}
        <View style={st.border}>
          {/* Header row */}
          <View style={[st.row, st.hdrBg]}>
            <View style={{ width: COL.num,  padding: "3pt 2pt", borderRight: "1pt solid #000", textAlign: "center" }}>
              <Text style={[st.bold, st.tiny]}>#</Text>
            </View>
            <View style={{ width: COL.pvno, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>PV No.</Text>
            </View>
            <View style={{ width: COL.payee, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Payee</Text>
            </View>
            <View style={{ width: COL.bank, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Bank</Text>
            </View>
            <View style={{ width: COL.acct, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>A/C No.</Text>
            </View>
            <View style={{ width: COL.amt, padding: "3pt 4pt", borderRight: "1pt solid #000", textAlign: "right" }}>
              <Text style={[st.bold, st.tiny]}>Amount</Text>
              <Text style={[st.bold, st.tiny]}>(RM)</Text>
            </View>
            <View style={{ width: COL.sig, padding: "3pt 6pt", borderRight: "1pt solid #000", textAlign: "center" }}>
              <Text style={[st.bold, st.tiny]}>Verified by</Text>
              <Text style={[st.bold, st.tiny]}>General Manager</Text>
            </View>
            <View style={{ width: COL.sig, padding: "3pt 6pt", textAlign: "center" }}>
              <Text style={[st.bold, st.tiny]}>Approved by</Text>
              <Text style={[st.bold, st.tiny]}>Signatory</Text>
            </View>
          </View>

          {/* Data rows */}
          {pvs.map((pv, i) => {
            const approvals: PVApproval[] = pv.approvals ?? [];
            const gm = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
            const sa = approvals.find(a =>
              ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
            );
            const bankName = pv.payment_method?.toLowerCase() === "jompay"
              ? "JomPay"
              : pv.cheque_no
                ? "Cheque"
                : BANK_ABBR[(pv.payee_bank_name ?? "").toLowerCase().trim()] ?? pv.payee_bank_name ?? "";
            const acctNo = pv.payment_method?.toLowerCase() === "jompay"
              ? `Biller: ${pv.biller_code ?? ""}  Ref: ${pv.ref_no ?? ""}`
              : pv.cheque_no
                ? pv.cheque_no
                : pv.payee_bank_acct ?? "";
            const isPaid = pv.status === "PAID";

            return (
              <View key={pv.id} style={[st.row, { borderTop: "1pt solid #000" }]}>
                <View style={{ width: COL.num, padding: "4pt 2pt", borderRight: "1pt solid #000", textAlign: "center" }}>
                  <Text style={st.tiny}>{i + 1}</Text>
                </View>
                <View style={{ width: COL.pvno, padding: "4pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={[st.bold, st.tiny, { color: "#4a6da7" }]}>{pv.pv_no}</Text>
                  {isPaid
                    ? <Text style={[st.tiny, { color: "#16a34a", fontFamily: "Helvetica-Bold" }]}>PAID</Text>
                    : null}
                </View>
                <View style={{ width: COL.payee, padding: "4pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={st.tiny}>{pv.payee_name ?? ""}</Text>
                </View>
                <View style={{ width: COL.bank, padding: "4pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={st.tiny}>{bankName}</Text>
                </View>
                <View style={{ width: COL.acct, padding: "4pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={st.tiny}>{acctNo}</Text>
                </View>
                <View style={{ width: COL.amt, padding: "4pt 4pt", borderRight: "1pt solid #000", textAlign: "right" }}>
                  <Text style={[st.bold, { fontSize: 8 }]}>{fmt(pv.amount ?? 0)}</Text>
                  {isPaid && (
                    <View style={{ border: "1pt solid #16a34a", borderRadius: 2, padding: "1pt 3pt", marginTop: 2 }}>
                      <Text style={[st.tiny, { color: "#16a34a", textAlign: "center" }]}>
                        PAID · {fmtDate(pv.paid_at)}
                      </Text>
                    </View>
                  )}
                </View>
                {/* GM Verified */}
                <View style={{ width: COL.sig, padding: "4pt 6pt", borderRight: "1pt solid #000" }}>
                  <Text style={[st.tiny, { color: "#555", marginBottom: 2 }]}>General Manager</Text>
                  {gm?.signature_data
                    ? <Image src={gm.signature_data} style={{ height: 22, objectFit: "contain", objectPositionX: "left", marginBottom: 2 }} />
                    : <View style={{ height: 22 }} />}
                  <View style={{ borderTop: "0.5pt solid #000", paddingTop: 2 }}>
                    <Text style={st.tiny}>Name: <Text style={st.bold}>{gm?.name ?? ""}</Text></Text>
                    <View style={{ borderBottom: "0.5pt solid #aaa", height: 1, marginBottom: 1 }} />
                    <Text style={st.tiny}>Date: {fmtDate(gm?.timestamp)}</Text>
                    <View style={{ borderBottom: "0.5pt solid #aaa", height: 1 }} />
                  </View>
                </View>
                {/* Signatory */}
                <View style={{ width: COL.sig, padding: "4pt 6pt" }}>
                  <Text style={[st.tiny, { color: "#555", marginBottom: 2 }]}>Signatory</Text>
                  {sa?.signature_data
                    ? <Image src={sa.signature_data} style={{ height: 22, objectFit: "contain", objectPositionX: "left", marginBottom: 2 }} />
                    : <View style={{ height: 22 }} />}
                  <View style={{ borderTop: "0.5pt solid #000", paddingTop: 2 }}>
                    <Text style={st.tiny}>Name: <Text style={st.bold}>{sa?.name ?? ""}</Text></Text>
                    <View style={{ borderBottom: "0.5pt solid #aaa", height: 1, marginBottom: 1 }} />
                    <Text style={st.tiny}>Date: {fmtDate(sa?.timestamp)}</Text>
                    <View style={{ borderBottom: "0.5pt solid #aaa", height: 1 }} />
                  </View>
                </View>
              </View>
            );
          })}

          {/* Total row */}
          <View style={[st.row, { borderTop: "1pt solid #000", backgroundColor: "#f8f8f8" }]}>
            <View style={{
              width: COL.num + COL.pvno + COL.payee + COL.bank + COL.acct,
              padding: "3pt 6pt", textAlign: "right", borderRight: "1pt solid #000",
            }}>
              <Text style={[st.bold, st.small]}>Total:</Text>
            </View>
            <View style={{ width: COL.amt, padding: "3pt 4pt", textAlign: "right", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.small]}>RM {fmt(grandTotal)}</Text>
            </View>
            <View style={{ width: COL.sig, padding: "3pt 4pt", borderRight: "1pt solid #000" }}><Text>{" "}</Text></View>
            <View style={{ width: COL.sig, padding: "3pt 4pt" }}><Text>{" "}</Text></View>
          </View>
        </View>

        {/* ── Finance signature ── */}
        <View style={{ marginTop: 12 }}>
          <Text style={[st.bold, st.small, { marginBottom: 3 }]}>
            Prepared by (Finance Executive):
          </Text>
          {finSigData
            ? <Image src={finSigData} style={{ height: 40, objectFit: "contain", objectPositionX: "left" }} />
            : <View style={{ height: 40 }} />}
          <View style={[st.borderT, { paddingTop: 3, flexDirection: "row", gap: 30 }]}>
            <Text style={st.tiny}>Name: <Text style={st.bold}>{runByName || run.run_by}</Text></Text>
            <Text style={st.tiny}>Date: <Text style={st.bold}>{fmtDate(run.run_date)}</Text></Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}

// ── Main component ────────────────────────────────────────────────────────
export default function BulkPVPdfDownload({
  run, pvs, finSigData, runByName,
}: {
  run: BulkRun; pvs: PV[]; finSigData: string; runByName: string;
}) {
  const [viewLoading, setViewLoading] = useState(false);
  const [dlLoading, setDlLoading]     = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [logoDataUri, setLogoDataUri] = useState("");
  const [previewUrl, setPreviewUrl]   = useState<string | null>(null);

  useEffect(() => {
    svgToPngDataUri("/lcm-logo.svg", 200).then(setLogoDataUri);
  }, []);

  const batchFilename = `BATCH-${new Date(run?.run_date ?? Date.now()).getFullYear()}-${(run?.id ?? "").slice(-6).toUpperCase()}`;

  async function buildBytes(): Promise<ArrayBuffer> {
    const logo = logoDataUri || await svgToPngDataUri("/lcm-logo.svg", 200);
    const summaryBlob = await pdf(
      <BatchSummaryDocument run={run} pvs={pvs} finSigData={finSigData} runByName={runByName} logoDataUri={logo} />
    ).toBlob();
    const finalDoc = await PDFDocument.load(await summaryBlob.arrayBuffer());
    for (const pv of pvs) {
      const pvBlob = await pdf(<PVDocument pv={pv} logoDataUri={logo} />).toBlob();
      const pvDoc  = await PDFDocument.load(await pvBlob.arrayBuffer());
      const [pvPage] = await finalDoc.copyPages(pvDoc, [0]);
      finalDoc.addPage(pvPage);
      const attUrls = [...(pv.attachments ?? []), ...(pv.payment_receipt_url ? [pv.payment_receipt_url] : [])].filter(Boolean);
      for (const url of attUrls) {
        const file = await fetchBytes(url);
        if (!file) continue;
        const isPdf = file.contentType.includes("pdf") || url.toLowerCase().endsWith(".pdf");
        const isPng = file.contentType.includes("png") || url.toLowerCase().endsWith(".png");
        if (isPdf) {
          const attDoc = await PDFDocument.load(file.bytes, { ignoreEncryption: true });
          const pages  = await finalDoc.copyPages(attDoc, attDoc.getPageIndices());
          pages.forEach(p => finalDoc.addPage(p));
        } else {
          const img = isPng ? await finalDoc.embedPng(file.bytes) : await finalDoc.embedJpg(file.bytes);
          const { width, height } = img.scaleToFit(595, 842);
          const page = finalDoc.addPage([595, 842]);
          page.drawImage(img, { x: (595 - width) / 2, y: (842 - height) / 2, width, height });
        }
      }
    }
    const bytes = await finalDoc.save();
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  async function openPreview() {
    if (!run || !pvs.length) return;
    setViewLoading(true); setError(null);
    try {
      const buf = await buildBytes();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(new Blob([buf], { type: "application/pdf" })));
    } catch {
      setError("Failed to generate PDF preview.");
    } finally {
      setViewLoading(false);
    }
  }

  async function download() {
    if (!run || !pvs.length) return;
    setDlLoading(true); setError(null);
    try {
      const buf = await buildBytes();
      const url = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url; a.download = `${batchFilename}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF.");
    } finally {
      setDlLoading(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  return (
    <>
      {previewUrl && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-stone-900">
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-stone-200 shrink-0">
            <span className="text-sm font-semibold text-stone-700">{batchFilename}.pdf</span>
            <div className="flex items-center gap-2">
              <button
                onClick={download}
                disabled={dlLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 disabled:opacity-50 transition-colors"
              >
                <Download size={13} /> {dlLoading ? "Saving…" : "Download"}
              </button>
              <button
                onClick={closePreview}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-stone-300 rounded-lg text-stone-600 hover:bg-stone-50 transition-colors"
              >
                <X size={13} /> Close
              </button>
            </div>
          </div>
          <iframe src={previewUrl} className="flex-1 w-full border-0" title={batchFilename} />
        </div>
      )}

      <div className="inline-flex flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
          <button
            onClick={openPreview}
            disabled={viewLoading || !pvs.length}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-lg text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <Eye size={14} />
            {viewLoading ? "Generating…" : "View PDF"}
          </button>
          <button
            onClick={download}
            disabled={dlLoading || !pvs.length}
            title="Download PDF"
            className="flex items-center justify-center w-8 h-8 border border-stone-300 rounded-lg text-stone-500 hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            {dlLoading ? <span className="text-[10px]">…</span> : <Download size={14} />}
          </button>
        </div>
        {error && <p className="text-xs text-red-600 max-w-xs">{error}</p>}
      </div>
    </>
  );
}
