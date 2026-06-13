"use client";
import { useState, useEffect } from "react";
import { Printer } from "lucide-react";
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

// ── Batch Summary Page ────────────────────────────────────────────────────
function BatchSummaryDocument({
  run, pvs, finSigData, runByName, logoDataUri,
}: {
  run: BulkRun; pvs: PV[]; finSigData: string; runByName: string; logoDataUri?: string;
}) {
  const year      = new Date(run.run_date).getFullYear();
  const batchRef  = `BATCH-${year}-${run.id.slice(-6).toUpperCase()}`;
  const grandTotal = pvs.reduce((sum, p) => sum + (p.amount ?? 0), 0);

  return (
    <Document title={`Batch ${run.group_name}`}>
      <Page size="A4" style={st.page}>

        {/* ── Header ── */}
        <View style={[st.row, { marginBottom: 8, alignItems: "flex-start" }]}>
          <View style={{ flex: 1 }}>
            <View style={st.row}>
              {logoDataUri
                ? <Image src={logoDataUri} style={{ width: 44, height: 44, marginRight: 8 }} />
                : null}
              <View style={{ flex: 1 }}>
                <Text style={[st.bold, { fontSize: 12 }]}>LUTHERAN CHURCH IN MALAYSIA</Text>
                <Text style={[st.tiny, { color: "#555", marginBottom: 4 }]}>马来西亚基督教信义会</Text>
                <Text style={[st.bold, { fontSize: 10 }]}>BATCH PAYMENT SUMMARY  批量付款汇总</Text>
              </View>
            </View>
          </View>
          <View style={[st.border, { width: 120, padding: "4pt 6pt", alignItems: "center" }]}>
            <Text style={[st.bold, st.tiny, {
              textAlign: "center", borderBottom: "1pt solid #000",
              width: "100%", paddingBottom: 2, marginBottom: 3,
            }]}>FOR OFFICE USE ONLY</Text>
            <Text style={[st.bold, { fontSize: 8 }]}>{batchRef}</Text>
          </View>
        </View>

        {/* ── Batch info grid ── */}
        <View style={[st.border, { marginBottom: 8 }]}>
          <View style={st.row}>
            <View style={{ width: 80, padding: "3pt 5pt", borderRight: "1pt solid #000", borderBottom: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Group 组别:</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 5pt", borderRight: "1pt solid #000", borderBottom: "1pt solid #000" }}>
              <Text style={[st.bold, { fontSize: 8 }]}>{run.group_name}</Text>
            </View>
            <View style={{ width: 70, padding: "3pt 5pt", borderRight: "1pt solid #000", borderBottom: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Run Date 日期:</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 5pt", borderBottom: "1pt solid #000" }}>
              <Text style={{ fontSize: 8 }}>{fmtDate(run.run_date)}</Text>
            </View>
          </View>
          <View style={[st.row, run.ministry ? { borderBottom: "1pt solid #000" } : {}]}>
            <View style={{ width: 80, padding: "3pt 5pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Prepared by:</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 5pt", borderRight: "1pt solid #000" }}>
              <Text style={{ fontSize: 8 }}>{runByName || run.run_by}</Text>
            </View>
            <View style={{ width: 70, padding: "3pt 5pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>No. of PVs:</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 5pt" }}>
              <Text style={[st.bold, { fontSize: 8 }]}>
                {run.pv_count} voucher{run.pv_count !== 1 ? "s" : ""}
              </Text>
            </View>
          </View>
          {run.ministry ? (
            <View style={st.row}>
              <View style={{ width: 80, padding: "3pt 5pt", borderRight: "1pt solid #000" }}>
                <Text style={[st.bold, st.tiny]}>Ministry:</Text>
              </View>
              <View style={{ flex: 1, padding: "3pt 5pt" }}>
                <Text style={{ fontSize: 8 }}>{run.ministry}</Text>
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Payment details table ── */}
        <Text style={[st.bold, { fontSize: 9, marginBottom: 3 }]}>
          Payment Details 付款详情
        </Text>
        <View style={st.border}>
          {/* Header row */}
          <View style={[st.row, st.hdrBg]}>
            <View style={{ width: 16, padding: "3pt 2pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny, st.center]}>#</Text>
            </View>
            <View style={{ width: 58, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>PV No.</Text>
            </View>
            <View style={{ width: 105, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Payee 收款人</Text>
            </View>
            <View style={{ width: 140, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>Bank / Account No.</Text>
            </View>
            <View style={{ width: 65, padding: "3pt 4pt", borderRight: "1pt solid #000", textAlign: "right" }}>
              <Text style={[st.bold, st.tiny]}>Amount (RM)</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.tiny]}>GM Verified</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 4pt" }}>
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
            const bankLine = pv.payment_method?.toLowerCase() === "jompay"
              ? `JomPay · Biller: ${pv.biller_code ?? ""}  Ref: ${pv.ref_no ?? ""}`
              : pv.cheque_no
                ? `Cheque ${pv.cheque_no}`
                : [
                    BANK_ABBR[(pv.payee_bank_name ?? "").toLowerCase().trim()] ?? pv.payee_bank_name ?? "",
                    pv.payee_bank_acct ?? "",
                  ].filter(Boolean).join(" | ");
            const isPaid = pv.status === "PAID";

            return (
              <View key={pv.id} style={[st.row, { borderTop: "1pt solid #000" }]}>
                <View style={{ width: 16, padding: "3pt 2pt", borderRight: "1pt solid #000", textAlign: "center" }}>
                  <Text style={st.tiny}>{i + 1}</Text>
                </View>
                <View style={{ width: 58, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={[st.bold, st.tiny, { color: "#4a6da7" }]}>{pv.pv_no}</Text>
                  {isPaid
                    ? <Text style={[st.tiny, { color: "#16a34a" }]}>{"●"} PAID</Text>
                    : null}
                </View>
                <View style={{ width: 105, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={st.tiny}>{pv.payee_name ?? ""}</Text>
                </View>
                <View style={{ width: 140, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
                  <Text style={st.tiny}>{bankLine}</Text>
                </View>
                <View style={{ width: 65, padding: "3pt 4pt", borderRight: "1pt solid #000", textAlign: "right" }}>
                  <Text style={[st.bold, st.small]}>{fmt(pv.amount ?? 0)}</Text>
                </View>
                <View style={{ flex: 1, padding: "3pt 4pt", borderRight: "1pt solid #000" }}>
                  {gm
                    ? <Text style={[st.tiny, { color: "#15803d" }]}>{"✓"} {gm.name ?? ""}</Text>
                    : <Text style={[st.tiny, { color: "#bbb" }]}>{"—"}</Text>}
                </View>
                <View style={{ flex: 1, padding: "3pt 4pt" }}>
                  {sa
                    ? <Text style={[st.tiny, { color: "#15803d" }]}>{"✓"} {sa.name ?? ""}</Text>
                    : <Text style={[st.tiny, { color: "#bbb" }]}>{"—"}</Text>}
                </View>
              </View>
            );
          })}

          {/* Total row */}
          <View style={[st.row, { borderTop: "1pt solid #000", backgroundColor: "#f8f8f8" }]}>
            <View style={{ flex: 1, padding: "3pt 6pt", textAlign: "right", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.small]}>Total 总数:</Text>
            </View>
            <View style={{ width: 65, padding: "3pt 4pt", textAlign: "right", borderRight: "1pt solid #000" }}>
              <Text style={[st.bold, st.small]}>RM {fmt(grandTotal)}</Text>
            </View>
            <View style={{ flex: 1, padding: "3pt 4pt", borderRight: "1pt solid #000" }}><Text>{" "}</Text></View>
            <View style={{ flex: 1, padding: "3pt 4pt" }}><Text>{" "}</Text></View>
          </View>
        </View>

        {/* ── Finance signature ── */}
        <View style={{ marginTop: 16 }}>
          <Text style={[st.bold, st.small, { marginBottom: 3 }]}>
            Prepared by 制备者签名 (Finance Executive):
          </Text>
          {finSigData
            ? <Image src={finSigData} style={{ height: 44, objectFit: "contain", objectPositionX: "left" }} />
            : <View style={{ height: 44 }} />}
          <View style={[st.borderT, { paddingTop: 3, flexDirection: "row", gap: 20 }]}>
            <Text style={st.tiny}>
              Name: <Text style={st.bold}>{runByName || run.run_by}</Text>
            </Text>
            <Text style={st.tiny}>
              Date: <Text style={st.bold}>{fmtDate(run.run_date)}</Text>
            </Text>
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
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [logoDataUri, setLogoDataUri] = useState("");

  useEffect(() => {
    svgToPngDataUri("/lcm-logo.svg", 200).then(setLogoDataUri);
  }, []);

  async function generate() {
    if (!run || !pvs.length) return;
    setLoading(true);
    setError(null);
    try {
      const logo = logoDataUri || await svgToPngDataUri("/lcm-logo.svg", 200);

      // 1. Generate batch summary page
      const summaryBlob = await pdf(
        <BatchSummaryDocument
          run={run} pvs={pvs} finSigData={finSigData}
          runByName={runByName} logoDataUri={logo}
        />
      ).toBlob();
      const finalDoc = await PDFDocument.load(await summaryBlob.arrayBuffer());

      // 2. For each PV: add its form page then any attachments
      for (const pv of pvs) {
        // PV form page (same as individual PDF download)
        const pvBlob = await pdf(<PVDocument pv={pv} logoDataUri={logo} />).toBlob();
        const pvDoc  = await PDFDocument.load(await pvBlob.arrayBuffer());
        const [pvPage] = await finalDoc.copyPages(pvDoc, [0]);
        finalDoc.addPage(pvPage);

        // Attachments: supporting docs then payment receipt
        const attUrls = [
          ...(pv.attachments ?? []),
          ...(pv.payment_receipt_url ? [pv.payment_receipt_url] : []),
        ].filter(Boolean);

        for (const url of attUrls) {
          const file = await fetchBytes(url);
          if (!file) continue;
          const isPdf  = file.contentType.includes("pdf")  || url.toLowerCase().endsWith(".pdf");
          const isPng  = file.contentType.includes("png")  || url.toLowerCase().endsWith(".png");
          if (isPdf) {
            const attDoc = await PDFDocument.load(file.bytes);
            const pages  = await finalDoc.copyPages(attDoc, attDoc.getPageIndices());
            pages.forEach(p => finalDoc.addPage(p));
          } else {
            const img = isPng
              ? await finalDoc.embedPng(file.bytes)
              : await finalDoc.embedJpg(file.bytes);
            const { width, height } = img.scaleToFit(595, 842);
            const page = finalDoc.addPage([595, 842]);
            page.drawImage(img, { x: (595 - width) / 2, y: (842 - height) / 2, width, height });
          }
        }
      }

      // 3. Save and download
      const bytes  = await finalDoc.save();
      const buf    = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const blobUrl = URL.createObjectURL(new Blob([buf], { type: "application/pdf" }));
      const year   = new Date(run.run_date).getFullYear();
      const a      = document.createElement("a");
      a.href       = blobUrl;
      a.download   = `BATCH-${year}-${run.id.slice(-6).toUpperCase()}.pdf`;
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error("Bulk PDF generation failed:", err);
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        onClick={generate}
        disabled={loading || !pvs.length}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-300 rounded-lg text-sm text-stone-600 hover:bg-stone-50 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <Printer size={14} />
        {loading ? "Generating PDF…" : "Print / PDF"}
      </button>
      {error && <p className="text-xs text-red-600 max-w-xs">{error}</p>}
    </div>
  );
}
