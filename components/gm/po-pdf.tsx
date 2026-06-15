"use client";
import { useState } from "react";
import { FileDown, Eye, X } from "lucide-react";
import {
  pdf, Document, Page, Text, View, StyleSheet, Image,
} from "@react-pdf/renderer";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(n: number) {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s?: string | null) {
  if (!s) return new Date().toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });
}

async function svgToPng(url: string, size = 200): Promise<string> {
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
// Types
// ---------------------------------------------------------------------------

export interface POLineItem {
  description: string;
  qty: number;
  unit_price: number;
  amount: number;
}

export interface POData {
  po_number: string;
  claim_no: string;
  claimant_name: string;
  supplier_name: string;
  supplier_address?: string;
  is_fixed_asset: boolean;
  asset_description?: string;
  ministry?: string;
  purpose: string;
  line_items: POLineItem[];
  received_at: string;
  notes?: string;
  gm_name?: string;
}

// ---------------------------------------------------------------------------
// PDF styles
// ---------------------------------------------------------------------------

const S = StyleSheet.create({
  page:        { padding: 44, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header:      { flexDirection: "row", alignItems: "flex-start", marginBottom: 18, borderBottom: "2pt solid #2d4e87", paddingBottom: 14 },
  logo:        { width: 54, height: 54, marginRight: 14 },
  orgCol:      { flex: 1 },
  orgName:     { fontSize: 15, fontFamily: "Helvetica-Bold", color: "#2d4e87", marginBottom: 2 },
  orgSub:      { fontSize: 8, color: "#666", lineHeight: 1.4 },
  poBox:       { alignItems: "flex-end" },
  poTitle:     { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#2d4e87", letterSpacing: 1 },
  poNo:        { fontSize: 10, color: "#333", marginTop: 3 },
  poDate:      { fontSize: 9, color: "#888", marginTop: 1 },

  infoRow:     { flexDirection: "row", gap: 16, marginBottom: 14 },
  infoBox:     { flex: 1, padding: "8 10", backgroundColor: "#f4f7fd", borderRadius: 3, borderLeft: "3pt solid #2d4e87" },
  infoLabel:   { fontSize: 8, color: "#2d4e87", fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  infoValue:   { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111" },
  infoSub:     { fontSize: 9, color: "#555", marginTop: 2, lineHeight: 1.4 },

  assetBanner: { flexDirection: "row", alignItems: "center", padding: "6 10", backgroundColor: "#fff7ed", borderRadius: 3, border: "1pt solid #f59e0b", marginBottom: 10 },
  assetLabel:  { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#b45309", marginRight: 6 },
  assetDesc:   { fontSize: 9, color: "#78350f" },

  section:     { marginTop: 12 },
  secTitle:    { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: "#2d4e87", marginBottom: 6, borderBottom: "0.5pt solid #d0d9ec", paddingBottom: 3 },

  th:          { flexDirection: "row", backgroundColor: "#2d4e87", padding: "5 6" },
  thText:      { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#fff" },
  tr:          { flexDirection: "row", padding: "5 6", borderBottom: "0.5pt solid #e5e7eb" },
  tdDesc:      { flex: 1, fontSize: 9, color: "#111" },
  tdQty:       { width: 36, textAlign: "right", fontSize: 9, color: "#111" },
  tdPrice:     { width: 72, textAlign: "right", fontSize: 9, color: "#111" },
  tdAmt:       { width: 72, textAlign: "right", fontSize: 9, color: "#111" },

  totalRow:    { flexDirection: "row", padding: "6 6", backgroundColor: "#f4f7fd" },
  totalLabel:  { flex: 1, fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right", color: "#2d4e87", paddingRight: 8 },
  totalAmt:    { width: 72, textAlign: "right", fontSize: 10, fontFamily: "Helvetica-Bold", color: "#2d4e87" },

  purpose:     { marginTop: 10, padding: "7 10", backgroundColor: "#f9fafb", borderRadius: 3, fontSize: 9, color: "#555" },
  purposeLabel:{ fontFamily: "Helvetica-Bold", color: "#333", marginBottom: 2 },

  terms:       { marginTop: 12, fontSize: 8, color: "#888", lineHeight: 1.5 },

  sigArea:     { flexDirection: "row", marginTop: 28, gap: 30 },
  sigBox:      { flex: 1, borderTop: "1pt solid #999", paddingTop: 6 },
  sigLabel:    { fontSize: 8, color: "#555" },
  sigName:     { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#111", marginTop: 2 },

  footer:      { marginTop: 24, borderTop: "0.5pt solid #ddd", paddingTop: 8, flexDirection: "row", justifyContent: "space-between" },
  footText:    { fontSize: 7.5, color: "#aaa" },
});

// ---------------------------------------------------------------------------
// PDF Document
// ---------------------------------------------------------------------------

function PODocument({ data, logoDataUri }: { data: POData; logoDataUri?: string }) {
  const total = data.line_items.reduce((s, r) => s + r.amount, 0);

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* ── Header ── */}
        <View style={S.header}>
          <View style={{ flexDirection: "row", flex: 1, alignItems: "flex-start" }}>
            {logoDataUri ? <Image src={logoDataUri} style={S.logo} /> : null}
            <View style={S.orgCol}>
              <Text style={S.orgName}>Lutheran Church in Malaysia</Text>
              <Text style={S.orgSub}>Luther Centre, Jalan Ampang, 50450 Kuala Lumpur{"\n"}Tel: +603-2164 3411  |  finance@lutheranchurch.org.my</Text>
            </View>
          </View>
          <View style={S.poBox}>
            <Text style={S.poTitle}>PURCHASE ORDER</Text>
            <Text style={S.poNo}>{data.po_number}</Text>
            <Text style={S.poDate}>Date: {fmtDate(data.received_at)}</Text>
          </View>
        </View>

        {/* ── Supplier / Raised-by info ── */}
        <View style={S.infoRow}>
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Supplier / Vendor</Text>
            <Text style={S.infoValue}>{data.supplier_name}</Text>
            {data.supplier_address ? <Text style={S.infoSub}>{data.supplier_address}</Text> : null}
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Raised By / Claimant</Text>
            <Text style={S.infoValue}>{data.claimant_name}</Text>
            {data.ministry ? <Text style={S.infoSub}>{data.ministry}</Text> : null}
            <Text style={S.infoSub}>Ref: {data.claim_no}</Text>
          </View>
        </View>

        {/* ── Fixed Asset notice ── */}
        {data.is_fixed_asset && (
          <View style={S.assetBanner}>
            <Text style={S.assetLabel}>FIXED ASSET PURCHASE</Text>
            {data.asset_description ? <Text style={S.assetDesc}>{data.asset_description}</Text> : null}
          </View>
        )}

        {/* ── Line items table ── */}
        <View style={S.section}>
          <Text style={S.secTitle}>Order Details</Text>
          <View style={S.th}>
            <Text style={[S.thText, S.tdDesc]}>Description</Text>
            <Text style={[S.thText, S.tdQty]}>Qty</Text>
            <Text style={[S.thText, S.tdPrice]}>Unit Price</Text>
            <Text style={[S.thText, S.tdAmt]}>Amount</Text>
          </View>
          {data.line_items.map((item, i) => (
            <View key={i} style={[S.tr, { backgroundColor: i % 2 === 0 ? "#fff" : "#f9fafb" }]}>
              <Text style={S.tdDesc}>{item.description}</Text>
              <Text style={S.tdQty}>{item.qty}</Text>
              <Text style={S.tdPrice}>{fmt(item.unit_price)}</Text>
              <Text style={S.tdAmt}>{fmt(item.amount)}</Text>
            </View>
          ))}
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Total</Text>
            <Text style={S.totalAmt}>{fmt(total)}</Text>
          </View>
        </View>

        {/* ── Purpose / description ── */}
        {data.purpose && (
          <View style={S.purpose}>
            <Text style={S.purposeLabel}>Purpose / Remarks</Text>
            <Text>{data.purpose}</Text>
          </View>
        )}

        {/* ── Terms ── */}
        <Text style={S.terms}>
          {`Terms & Conditions:\n`}
          {`1. This Purchase Order is valid only when bearing the authorised signature of the General Manager of Lutheran Church in Malaysia.\n`}
          {`2. Please quote this PO number on all invoices and correspondence: ${data.po_number}\n`}
          {`3. Goods/services must be delivered as specified. Any variation requires prior written approval.\n`}
          {`4. Invoices should be submitted to: finance@lutheranchurch.org.my`}
        </Text>

        {/* ── Signatures ── */}
        <View style={S.sigArea}>
          <View style={S.sigBox}>
            <Text style={S.sigLabel}>Authorised by (General Manager)</Text>
            <Text style={[S.sigName, { marginTop: 28 }]}>{data.gm_name ?? "General Manager"}</Text>
            <Text style={S.sigLabel}>Lutheran Church in Malaysia</Text>
          </View>
          <View style={S.sigBox}>
            <Text style={S.sigLabel}>Received / Acknowledged by (Supplier)</Text>
            <Text style={[S.sigName, { marginTop: 28 }]}>Name: ___________________________</Text>
            <Text style={S.sigLabel}>Date: ___________________________</Text>
          </View>
        </View>

        {/* ── Footer ── */}
        <View style={S.footer}>
          <Text style={S.footText}>Lutheran Church in Malaysia  |  {data.po_number}</Text>
          <Text style={S.footText}>Generated {new Date().toLocaleDateString("en-MY")}</Text>
        </View>
      </Page>
    </Document>
  );
}

// ---------------------------------------------------------------------------
// Button component
// ---------------------------------------------------------------------------

export function POPdfButton({ data }: { data: POData }) {
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");

  async function generate(mode: "preview" | "download") {
    setBusy(true);
    try {
      const logo = await svgToPng("/lcm-logo.svg", 200).catch(() => "");
      const blob = await pdf(<PODocument data={data} logoDataUri={logo} />).toBlob();
      const url = URL.createObjectURL(blob);
      if (mode === "download") {
        const a = document.createElement("a");
        a.href = url;
        a.download = `${data.po_number}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } else {
        const isMobile = window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (isMobile) {
          window.open(url, "_blank");
          setTimeout(() => URL.revokeObjectURL(url), 8000);
        } else {
          setPreviewUrl(url);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex rounded-lg overflow-hidden border border-stone-200 shrink-0">
        <button
          onClick={() => generate("preview")}
          disabled={busy}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-white hover:bg-stone-50 text-stone-600 transition-colors border-r border-stone-200 disabled:opacity-50">
          <Eye size={11} /> View PO
        </button>
        <button
          onClick={() => generate("download")}
          disabled={busy}
          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 bg-white hover:bg-stone-50 text-stone-600 transition-colors disabled:opacity-50">
          <FileDown size={11} /> {busy ? "…" : "PDF"}
        </button>
      </div>

      {previewUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col">
          <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-stone-200">
            <span className="text-sm font-semibold text-stone-700">{data.po_number}</span>
            <div className="flex gap-2">
              <button onClick={() => generate("download")}
                className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg bg-[#4a6da7] text-white hover:bg-[#3a5d97]">
                <FileDown size={12} /> Download
              </button>
              <button onClick={() => { URL.revokeObjectURL(previewUrl); setPreviewUrl(""); }}
                className="p-1.5 text-stone-400 hover:text-stone-600">
                <X size={18} />
              </button>
            </div>
          </div>
          <iframe src={previewUrl} className="flex-1 w-full border-0" title="Purchase Order Preview" />
        </div>
      )}
    </>
  );
}
