"use client";
import { useEffect, useRef, useState } from "react";
import { X, Printer, FileDown } from "lucide-react";
import { pdf, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PrintClaim {
  claim_no: string;
  purpose: string;
  description: string | null;
  amount: number;
  claimant_name: string;
  claimant_type: string | null;
  ministry: string | null;
  received_at: string;
  pv_id: string | null;
  status_label: string; // e.g. "Paid", "PV Pending Creation", "In Progress"
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s?: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "short", year: "numeric" });
}

async function svgToPng(url: string, size = 120): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = size; c.height = size;
      c.getContext("2d")!.drawImage(img, 0, 0, size, size);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve("");
    img.src = url;
  });
}

// ---------------------------------------------------------------------------
// react-pdf Document
// ---------------------------------------------------------------------------

const S = StyleSheet.create({
  page:       { padding: 40, fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a" },
  header:     { alignItems: "center", marginBottom: 16, paddingBottom: 12, borderBottom: "1.5pt solid #2d4e87" },
  logo:       { width: 64, height: 64, marginBottom: 6 },
  title:      { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#2d4e87", textTransform: "uppercase", letterSpacing: 1 },
  subtitle:   { fontSize: 8, color: "#666", marginTop: 2 },
  th:         { flexDirection: "row", backgroundColor: "#2d4e87", padding: "5 4" },
  thText:     { fontSize: 8, fontFamily: "Helvetica-Bold", color: "#fff" },
  tr:         { flexDirection: "row", padding: "4 4", borderBottom: "0.5pt solid #e5e7eb" },
  trAlt:      { flexDirection: "row", padding: "4 4", borderBottom: "0.5pt solid #e5e7eb", backgroundColor: "#f8faff" },
  tdNo:       { width: 22, fontSize: 8, color: "#555" },
  tdPurpose:  { flex: 1, fontSize: 8, color: "#111" },
  tdAmt:      { width: 64, textAlign: "right", fontSize: 8, color: "#111" },
  tdName:     { width: 80, fontSize: 8, color: "#111" },
  tdMin:      { width: 72, fontSize: 8, color: "#555" },
  tdDate:     { width: 56, fontSize: 8, color: "#555" },
  tdStatus:   { width: 64, fontSize: 8, color: "#555" },
  totalRow:   { flexDirection: "row", padding: "5 4", backgroundColor: "#eef2fb", marginTop: 2 },
  totalLabel: { flex: 1, fontSize: 9, fontFamily: "Helvetica-Bold", textAlign: "right", color: "#2d4e87", paddingRight: 4 },
  totalAmt:   { width: 64, textAlign: "right", fontSize: 9, fontFamily: "Helvetica-Bold", color: "#2d4e87" },
  footer:     { marginTop: 24, borderTop: "0.5pt solid #ddd", paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footText:   { fontSize: 7, color: "#aaa" },
});

function ClaimsPDFDocument({ claims, logoUri }: { claims: PrintClaim[]; logoUri: string }) {
  const total = claims.reduce((s, c) => s + c.amount, 0);
  const now = new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          {logoUri ? <Image src={logoUri} style={S.logo} /> : null}
          <Text style={S.title}>Claims Requests Processing</Text>
          <Text style={S.subtitle}>Lutheran Church in Malaysia  |  Printed: {now}</Text>
        </View>

        {/* Table header */}
        <View style={S.th}>
          <Text style={[S.thText, S.tdNo]}>No.</Text>
          <Text style={[S.thText, S.tdPurpose]}>Claims / Payments</Text>
          <Text style={[S.thText, S.tdAmt]}>Value (RM)</Text>
          <Text style={[S.thText, S.tdName]}>Claimant</Text>
          <Text style={[S.thText, S.tdMin]}>Committee</Text>
          <Text style={[S.thText, S.tdDate]}>Date</Text>
          <Text style={[S.thText, S.tdStatus]}>Status</Text>
        </View>

        {/* Rows */}
        {claims.map((c, i) => (
          <View key={c.claim_no} style={i % 2 === 0 ? S.tr : S.trAlt}>
            <Text style={S.tdNo}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 8, fontFamily: "Helvetica-Bold", color: "#111" }}>{c.purpose}</Text>
              {c.description ? <Text style={{ fontSize: 7, color: "#666", marginTop: 1 }}>{c.description.slice(0, 60)}{c.description.length > 60 ? "…" : ""}</Text> : null}
              <Text style={{ fontSize: 7, color: "#999", marginTop: 1 }}>{c.claim_no}</Text>
            </View>
            <Text style={S.tdAmt}>{fmt(c.amount)}</Text>
            <View style={{ width: 80 }}>
              <Text style={{ fontSize: 8, color: "#111" }}>{c.claimant_name}</Text>
              {c.claimant_type ? <Text style={{ fontSize: 7, color: "#999" }}>{c.claimant_type}</Text> : null}
            </View>
            <Text style={S.tdMin}>{c.ministry ?? "—"}</Text>
            <Text style={S.tdDate}>{fmtDate(c.received_at)}</Text>
            <Text style={S.tdStatus}>{c.status_label}</Text>
          </View>
        ))}

        {/* Total */}
        <View style={S.totalRow}>
          <Text style={S.totalLabel}>TOTAL</Text>
          <Text style={S.totalAmt}>{fmt(total)}</Text>
        </View>

        {/* Footer */}
        <View style={S.footer}>
          <Text style={S.footText}>Lutheran Church in Malaysia — Confidential</Text>
          <Text style={S.footText}>Generated by LCM Finance System</Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

export function ClaimsPrintModal({ claims, onClose }: { claims: PrintClaim[]; onClose: () => void }) {
  const [logoUri, setLogoUri] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    svgToPng("/lcm-logo.svg", 160).then(setLogoUri);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const total = claims.reduce((s, c) => s + c.amount, 0);
  const now = new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });

  async function handleDownloadPdf() {
    setPdfLoading(true);
    try {
      const blob = await pdf(<ClaimsPDFDocument claims={claims} logoUri={logoUri} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `claims-requests-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setPdfLoading(false);
    }
  }

  function handlePrint() {
    const win = window.open("", "_blank", "width=900,height=750");
    if (!win) return;
    const content = previewRef.current?.innerHTML ?? "";
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Claims Requests Processing</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: Arial, sans-serif; }
        body { background: white; padding: 0; }
        @page { size: A4; margin: 20mm 15mm; }
        @media print { body { padding: 0; } }
      </style>
    </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 bg-[#2d4e87] text-white shrink-0">
        <span className="font-semibold text-sm">Print Preview — Claims Requests Processing</span>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-[#2d4e87] hover:bg-blue-50 transition-colors">
            <Printer size={13} /> Print
          </button>
          <button onClick={handleDownloadPdf} disabled={pdfLoading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] border border-white/30 text-white hover:bg-[#3a5d97] transition-colors disabled:opacity-50">
            <FileDown size={13} /> {pdfLoading ? "Generating…" : "Download PDF"}
          </button>
          <button onClick={onClose} className="ml-2 text-white/70 hover:text-white transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Scrollable A4 preview area */}
      <div className="flex-1 overflow-auto bg-stone-200 flex justify-center py-8 px-4">
        {/* A4 paper */}
        <div ref={previewRef}
          style={{ width: 794, minHeight: 1123, background: "white", boxShadow: "0 4px 32px rgba(0,0,0,0.25)", padding: "48px 44px", fontFamily: "Arial, sans-serif", fontSize: 11, color: "#1a1a1a", flexShrink: 0 }}>

          {/* Header */}
          <div style={{ textAlign: "center", borderBottom: "2px solid #2d4e87", paddingBottom: 16, marginBottom: 20 }}>
            {logoUri && <img src={logoUri} alt="LCM Logo" style={{ width: 72, height: 72, margin: "0 auto 8px", display: "block" }} />}
            <div style={{ fontSize: 17, fontWeight: 700, color: "#2d4e87", textTransform: "uppercase", letterSpacing: 1.5 }}>Claims Requests Processing</div>
            <div style={{ fontSize: 10, color: "#777", marginTop: 4 }}>Lutheran Church in Malaysia &nbsp;|&nbsp; Printed: {now}</div>
          </div>

          {/* Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ backgroundColor: "#2d4e87", color: "white" }}>
                <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 700, width: 28 }}>No.</th>
                <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 700 }}>Claims / Payments</th>
                <th style={{ padding: "7px 6px", textAlign: "right", fontWeight: 700, width: 90 }}>Value (RM)</th>
                <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 700, width: 110 }}>Claimant Name</th>
                <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 700, width: 100 }}>Committee</th>
                <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 700, width: 78 }}>Date</th>
                <th style={{ padding: "7px 6px", textAlign: "left", fontWeight: 700, width: 90 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {claims.map((c, i) => (
                <tr key={c.claim_no} style={{ backgroundColor: i % 2 === 0 ? "white" : "#f8faff", borderBottom: "0.5px solid #e5e7eb" }}>
                  <td style={{ padding: "6px 6px", color: "#777", verticalAlign: "top" }}>{i + 1}</td>
                  <td style={{ padding: "6px 6px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 600, color: "#111" }}>{c.purpose}</div>
                    {c.description && <div style={{ fontSize: 9, color: "#777", marginTop: 2 }}>{c.description.slice(0, 80)}{c.description.length > 80 ? "…" : ""}</div>}
                    <div style={{ fontSize: 9, color: "#aaa", marginTop: 2 }}>{c.claim_no}</div>
                  </td>
                  <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: 600, verticalAlign: "top" }}>
                    {c.amount.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                  </td>
                  <td style={{ padding: "6px 6px", verticalAlign: "top" }}>
                    <div>{c.claimant_name}</div>
                    {c.claimant_type && <div style={{ fontSize: 9, color: "#999" }}>{c.claimant_type}</div>}
                  </td>
                  <td style={{ padding: "6px 6px", color: "#555", verticalAlign: "top" }}>{c.ministry ?? "—"}</td>
                  <td style={{ padding: "6px 6px", color: "#555", verticalAlign: "top", whiteSpace: "nowrap" }}>{fmtDate(c.received_at)}</td>
                  <td style={{ padding: "6px 6px", verticalAlign: "top" }}>
                    <span style={{
                      fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 20,
                      backgroundColor: c.status_label === "Paid" ? "#dcfce7" : c.status_label === "In Progress" ? "#dbeafe" : "#fef3c7",
                      color: c.status_label === "Paid" ? "#166534" : c.status_label === "In Progress" ? "#1e40af" : "#92400e",
                    }}>{c.status_label}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: "#eef2fb" }}>
                <td colSpan={2} style={{ padding: "8px 6px", fontWeight: 700, color: "#2d4e87", textAlign: "right" }}>TOTAL AMOUNT</td>
                <td style={{ padding: "8px 6px", fontWeight: 700, color: "#2d4e87", textAlign: "right" }}>
                  {total.toLocaleString("en-MY", { minimumFractionDigits: 2 })}
                </td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          </table>

          {/* Footer */}
          <div style={{ marginTop: 40, borderTop: "1px solid #e5e7eb", paddingTop: 10, display: "flex", justifyContent: "space-between", fontSize: 9, color: "#aaa" }}>
            <span>Lutheran Church in Malaysia — Confidential</span>
            <span>Generated by LCM Finance System</span>
          </div>
        </div>
      </div>
    </div>
  );
}
