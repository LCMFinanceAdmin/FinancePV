"use client";
import { useState } from "react";
import { Eye, Download, X } from "lucide-react";
import {
  pdf,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Image,
} from "@react-pdf/renderer";
import type { FacilityBooking, IncomeRecord } from "@/lib/types";
import { TIER_LABELS } from "@/lib/facilities";

// ─── amount-in-words helpers ──────────────────────────────────────────────────

const _ones = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const _tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function numWords(n: number): string {
  if (n === 0) return "Zero";
  if (n < 20) return _ones[n];
  if (n < 100) return _tens[Math.floor(n / 10)] + (n % 10 ? " " + _ones[n % 10] : "");
  if (n < 1000)
    return _ones[Math.floor(n / 100)] + " Hundred" + (n % 100 ? " " + numWords(n % 100) : "");
  if (n < 1_000_000)
    return numWords(Math.floor(n / 1000)) + " Thousand" + (n % 1000 ? " " + numWords(n % 1000) : "");
  return n.toString();
}

function amountInWords(amount: number): string {
  const ringgit = Math.floor(amount);
  const sen = Math.round((amount - ringgit) * 100);
  let words = "Ringgit Malaysia " + numWords(ringgit);
  if (sen > 0) words += " and " + numWords(sen) + " Sen";
  return words + " Only";
}

function fmt(n: number) {
  return "RM " + n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("en-MY", { day: "2-digit", month: "long", year: "numeric" });
}

// ─── styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  page:       { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: "#1a1a1a" },
  header:     { flexDirection: "row", alignItems: "flex-start", marginBottom: 16, borderBottom: "1.5pt solid #2d4e87", paddingBottom: 12 },
  logo:       { width: 52, height: 52, marginRight: 12 },
  orgCol:     { flex: 1 },
  orgName:    { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#2d4e87", marginBottom: 2 },
  orgSub:     { fontSize: 8, color: "#555" },
  receiptBox: { alignItems: "flex-end" },
  receiptTitle:{ fontSize: 14, fontFamily: "Helvetica-Bold", color: "#2d4e87", textTransform: "uppercase", letterSpacing: 1 },
  receiptNo:  { fontSize: 10, color: "#333", marginTop: 2 },
  row2:       { flexDirection: "row", marginBottom: 4 },
  label:      { width: 130, color: "#555", fontSize: 9 },
  value:      { flex: 1, fontFamily: "Helvetica-Bold" },
  section:    { marginTop: 14 },
  sectionTitle:{ fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8, color: "#2d4e87", marginBottom: 6, borderBottom: "0.5pt solid #d0d9ec", paddingBottom: 3 },
  tableHead:  { flexDirection: "row", backgroundColor: "#eef2fa", padding: "4 6", borderRadius: 2 },
  tableRow:   { flexDirection: "row", padding: "4 6", borderBottom: "0.5pt solid #e8e8e8" },
  col1:       { flex: 1, fontSize: 9 },
  col2:       { width: 60, textAlign: "right", fontSize: 9 },
  col3:       { width: 70, textAlign: "right", fontSize: 9 },
  col4:       { width: 70, textAlign: "right", fontSize: 9 },
  totalRow:   { flexDirection: "row", padding: "5 6", backgroundColor: "#f7f9ff" },
  amtWords:   { marginTop: 10, padding: "7 10", backgroundColor: "#f4f7fd", borderRadius: 3, fontSize: 9, fontStyle: "italic" },
  payRow:     { flexDirection: "row", marginBottom: 3 },
  sigArea:    { flexDirection: "row", marginTop: 28, gap: 24 },
  sigBox:     { flex: 1, borderTop: "1pt solid #999", paddingTop: 6, fontSize: 8, color: "#555" },
  footer:     { marginTop: 20, textAlign: "center", fontSize: 7.5, color: "#999" },
});

// ─── PDF document ─────────────────────────────────────────────────────────────

type ReceiptSource =
  | { kind: "booking"; data: FacilityBooking }
  | { kind: "income"; data: IncomeRecord };

interface Props {
  source: ReceiptSource;
  logoDataUri?: string;
}

function ReceiptDocument({ source, logoDataUri }: Props) {
  const isBooking = source.kind === "booking";
  const booking = isBooking ? source.data : null;
  const income  = !isBooking ? source.data : null;

  const receiptNo  = isBooking ? booking!.receipt_no  : income!.record_no;
  const payerName  = isBooking ? booking!.booker_name : income!.payer_name;
  const payerOrg   = isBooking ? booking!.booker_org  : income!.payer_org;
  const payDate    = isBooking ? (booking!.payment_date ?? booking!.created_at) : income!.payment_date;
  const payMethod  = isBooking ? booking!.payment_method : income!.payment_method;
  const payRef     = isBooking ? booking!.payment_ref  : income!.payment_ref;
  const totalAmt   = isBooking ? booking!.total_amount : income!.amount;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View style={S.orgCol}>
            {logoDataUri && <Image src={logoDataUri} style={S.logo} />}
            <Text style={S.orgName}>Lutheran Church of Malaysia</Text>
            <Text style={S.orgSub}>Luther Centre, Lot 1 Jalan 1/1A, 43000 Kajang, Selangor</Text>
            <Text style={S.orgSub}>Tel: +603-8736 5678</Text>
          </View>
          <View style={S.receiptBox}>
            <Text style={S.receiptTitle}>Official Receipt</Text>
            <Text style={S.receiptNo}>{receiptNo}</Text>
          </View>
        </View>

        {/* Payer info */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Received From</Text>
          <View style={S.row2}>
            <Text style={S.label}>Name</Text>
            <Text style={S.value}>{payerName}</Text>
          </View>
          {payerOrg ? (
            <View style={S.row2}>
              <Text style={S.label}>Organisation</Text>
              <Text style={S.value}>{payerOrg}</Text>
            </View>
          ) : null}
          {isBooking && booking!.booker_type ? (
            <View style={S.row2}>
              <Text style={S.label}>Payer Category</Text>
              <Text style={S.value}>{TIER_LABELS[booking!.booker_type] ?? booking!.booker_type}</Text>
            </View>
          ) : null}
          <View style={S.row2}>
            <Text style={S.label}>Receipt Date</Text>
            <Text style={S.value}>{fmtDate(payDate)}</Text>
          </View>
        </View>

        {/* Description */}
        <View style={S.section}>
          <Text style={S.sectionTitle}>Payment Details</Text>

          {isBooking ? (
            <>
              {booking!.event_name ? (
                <View style={S.row2}>
                  <Text style={S.label}>Event</Text>
                  <Text style={S.value}>{booking!.event_name}</Text>
                </View>
              ) : null}
              <View style={S.row2}>
                <Text style={S.label}>Booking Ref</Text>
                <Text style={S.value}>{booking!.booking_no}</Text>
              </View>
              <View style={S.row2}>
                <Text style={S.label}>Date(s)</Text>
                <Text style={S.value}>
                  {fmtDate(booking!.start_date)}
                  {booking!.end_date && booking!.end_date !== booking!.start_date
                    ? " — " + fmtDate(booking!.end_date)
                    : ""}
                </Text>
              </View>
              {booking!.purpose ? (
                <View style={S.row2}>
                  <Text style={S.label}>Purpose</Text>
                  <Text style={S.value}>{booking!.purpose}</Text>
                </View>
              ) : null}

              {/* Line items table */}
              <View style={{ marginTop: 10 }}>
                <View style={S.tableHead}>
                  <Text style={[S.col1, { fontFamily: "Helvetica-Bold", fontSize: 8 }]}>Facility</Text>
                  <Text style={[S.col2, { fontFamily: "Helvetica-Bold", fontSize: 8 }]}>Sessions</Text>
                  <Text style={[S.col3, { fontFamily: "Helvetica-Bold", fontSize: 8 }]}>Rate</Text>
                  <Text style={[S.col4, { fontFamily: "Helvetica-Bold", fontSize: 8 }]}>Subtotal</Text>
                </View>
                {booking!.booking_items.map((item, i) => (
                  <View key={i} style={S.tableRow}>
                    <Text style={S.col1}>
                      {item.facility_name}
                      {item.is_concurrent ? " (concurrent)" : ""}
                    </Text>
                    <Text style={S.col2}>{item.sessions} × {item.rate_label}</Text>
                    <Text style={S.col3}>{fmt(item.rate_per_session)}</Text>
                    <Text style={S.col4}>{fmt(item.subtotal)}</Text>
                  </View>
                ))}
                <View style={S.totalRow}>
                  <Text style={[S.col1, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Total</Text>
                  <Text style={S.col2} />
                  <Text style={S.col3} />
                  <Text style={[S.col4, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>{fmt(totalAmt)}</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={S.row2}>
                <Text style={S.label}>Type</Text>
                <Text style={S.value}>{income!.income_type === "ELECTRICITY" ? "Electricity Contribution" : income!.income_type === "DONATION" ? "Donation" : "Other Income"}</Text>
              </View>
              <View style={S.row2}>
                <Text style={S.label}>Description</Text>
                <Text style={S.value}>{income!.description}</Text>
              </View>
              {income!.period_covered ? (
                <View style={S.row2}>
                  <Text style={S.label}>Period Covered</Text>
                  <Text style={S.value}>{income!.period_covered}</Text>
                </View>
              ) : null}
              <View style={[S.totalRow, { marginTop: 8 }]}>
                <Text style={[S.col1, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>Amount Received</Text>
                <Text style={[S.col4, { fontFamily: "Helvetica-Bold", fontSize: 9 }]}>{fmt(totalAmt)}</Text>
              </View>
            </>
          )}
        </View>

        {/* Amount in words */}
        <View style={S.amtWords}>
          <Text style={{ fontFamily: "Helvetica-Bold", fontSize: 8.5 }}>
            {amountInWords(totalAmt)}
          </Text>
        </View>

        {/* Payment method */}
        <View style={[S.section, { marginTop: 12 }]}>
          <Text style={S.sectionTitle}>Payment Method</Text>
          <View style={S.payRow}>
            <Text style={S.label}>Method</Text>
            <Text style={S.value}>{payMethod || "—"}</Text>
          </View>
          {payRef ? (
            <View style={S.payRow}>
              <Text style={S.label}>Reference / Cheque No.</Text>
              <Text style={S.value}>{payRef}</Text>
            </View>
          ) : null}
        </View>

        {/* Signature area */}
        <View style={S.sigArea}>
          <View style={S.sigBox}>
            <Text>Received by (Finance Office)</Text>
          </View>
          <View style={S.sigBox}>
            <Text>Verified by (Authorised Signatory)</Text>
          </View>
        </View>

        {/* Notes */}
        {(isBooking ? booking!.notes : income!.notes) ? (
          <View style={{ marginTop: 12 }}>
            <Text style={[S.sectionTitle]}>Notes</Text>
            <Text style={{ fontSize: 8.5, color: "#444" }}>
              {isBooking ? booking!.notes : income!.notes}
            </Text>
          </View>
        ) : null}

        {/* Footer */}
        <Text style={S.footer}>
          This is a computer-generated official receipt and is valid without a wet signature.{"\n"}
          Lutheran Church of Malaysia — Income & Collections
        </Text>
      </Page>
    </Document>
  );
}

// ─── Public component ─────────────────────────────────────────────────────────

export function ReceiptPdfButton({
  source,
  logoDataUri,
}: {
  source: ReceiptSource;
  logoDataUri?: string;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function buildBytes() {
    const blob = await pdf(<ReceiptDocument source={source} logoDataUri={logoDataUri} />).toBlob();
    return blob;
  }

  async function openPreview() {
    setLoading(true);
    try {
      const blob = await buildBytes();
      const url = URL.createObjectURL(blob);
      setPreviewUrl(url);
    } finally {
      setLoading(false);
    }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function download() {
    const blob = await buildBytes();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const no = source.kind === "booking" ? source.data.receipt_no || source.data.booking_no : source.data.record_no;
    a.href = url;
    a.download = `LCM-Receipt-${no}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  return (
    <>
      {/* View + Download buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={openPreview}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
        >
          <Eye size={13} />
          {loading ? "Generating…" : "View Receipt"}
        </button>
        <button
          onClick={download}
          disabled={loading}
          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-50 text-stone-500 transition-colors disabled:opacity-50"
          title="Download PDF"
        >
          <Download size={14} />
        </button>
      </div>

      {/* Full-screen overlay */}
      {previewUrl && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/80">
          {/* Toolbar */}
          <div className="flex items-center justify-between px-4 py-2 bg-stone-900 text-white text-sm">
            <span className="font-medium">
              {source.kind === "booking" ? source.data.receipt_no || source.data.booking_no : source.data.record_no}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={download}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-medium transition-colors"
              >
                <Download size={13} /> Download
              </button>
              <button
                onClick={closePreview}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <iframe src={previewUrl} className="flex-1 w-full" title="Receipt Preview" />
        </div>
      )}
    </>
  );
}
