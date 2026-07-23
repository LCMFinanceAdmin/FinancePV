import { pdf, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { WorkerWorksheet } from "@/lib/types";
import { svgToPngDataUri } from "@/components/pv/pv-pdf-download";

const WORKER_TYPE_LABEL: Record<string, string> = {
  PA_PERSONNEL: "PA Personnel",
  BUILDING_CARE_TAKER: "Building Care Taker",
  RELA_PERSONNEL: "RELA Personnel",
};

const ACCENT = "#4a6da7";

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function fmtDateTime(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "";
  return `${fmtDate(s)} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const s = StyleSheet.create({
  page:      { fontFamily: "Helvetica", fontSize: 11, padding: "14mm", color: "#111" },
  row:       { flexDirection: "row" },
  bold:      { fontFamily: "Helvetica-Bold" },
  right:     { textAlign: "right" },
  tiny:      { fontSize: 9 },
  small:     { fontSize: 10 },
  muted:     { color: "#6b7280" },
  // Table: dividers live on the row/cell edges (borderRight + one shared
  // borderBottom per row) instead of a border on every individual cell —
  // giving every cell its own full border doubles the line weight wherever
  // two cells touch, which is what made the old table look misaligned.
  tableFrame:  { border: "0.8pt solid #1f2937", borderRadius: 2 },
  tableRow:    { borderBottom: "0.8pt solid #1f2937" },
  cell:        { padding: "5pt 7pt", borderRight: "0.8pt solid #1f2937" },
  cellLast:    { padding: "5pt 7pt" },
  headerBg:    { backgroundColor: ACCENT },
  headerText:  { color: "#fff" },
});

// Fixed, shared column widths — used identically for the header row and
// every entry row, so nothing can drift out of alignment between them.
const COL = { date: 2.1, time: 1.9, hours: 1, purpose: 2.6 };

function SigBox({ label, signature, signedBy, signedAt }: { label: string; signature?: string | null; signedBy?: string | null; signedAt?: string | null }) {
  const signed = !!signature;
  return (
    <View style={{ flex: 1, padding: "8pt 10pt" }}>
      {/* Label and the "Signed" tag stack rather than sit side-by-side — a
          longer label (e.g. "Verified by — Building/Event Manager") has no
          room to collide with anything else regardless of its length. */}
      <View style={{ marginBottom: 6 }}>
        <Text style={[s.bold, s.tiny]}>{label}</Text>
        {signed && <Text style={[s.tiny, { color: "#15803d", marginTop: 1 }]}>✓ Signed</Text>}
      </View>
      <View style={{
        height: 46, borderRadius: 3, padding: "5pt 6pt", overflow: "hidden",
        border: signed ? "0.8pt solid #d1d5db" : "0.8pt dashed #d1d5db",
        backgroundColor: signed ? "#fff" : "#fafafa",
      }}>
        {signed ? (
          // No wrapping flex-alignment on this box — an Image given only a
          // height (no explicit width) can collapse to zero width when its
          // parent applies alignItems/justifyContent, so it's given a fixed
          // width here instead of relying on auto-sizing from aspect ratio.
          <Image src={signature!} style={{ width: 150, height: 34, objectFit: "contain", objectPositionX: "left" }} />
        ) : (
          <Text style={[s.tiny, s.muted, { marginTop: 12 }]}>Pending signature</Text>
        )}
      </View>
      <View style={{ marginTop: 6 }}>
        <Text style={[s.small, s.bold]}>{signedBy || "—"}</Text>
        <Text style={[s.tiny, s.muted, { marginTop: 1 }]}>{signedAt ? `Signed ${fmtDateTime(signedAt)}` : "Awaiting signature"}</Text>
      </View>
    </View>
  );
}

function WorksheetDocument({ ws, logoDataUri }: { ws: WorkerWorksheet; logoDataUri: string }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* Header */}
        <View style={[s.row, { alignItems: "center", justifyContent: "space-between", paddingBottom: 10, marginBottom: 14, borderBottom: `2pt solid ${ACCENT}` }]}>
          <View style={[s.row, { alignItems: "center", gap: 10 }]}>
            {logoDataUri ? <Image src={logoDataUri} style={{ width: 42, height: 42 }} /> : null}
            <View>
              <Text style={[s.bold, { fontSize: 13, color: ACCENT }]}>Lutheran Church in Malaysia</Text>
              <Text style={[s.small, s.muted]}>Building / Event Management — Extra Worker Worksheet</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.bold, { fontSize: 12 }]}>{ws.worksheet_no}</Text>
            <Text style={[
              s.tiny, s.bold,
              { marginTop: 2, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8,
                backgroundColor: ws.status === "SIGNED" ? "#dcfce7" : ws.status === "PV_RAISED" ? "#dbeafe" : "#f3f4f6",
                color: ws.status === "SIGNED" ? "#15803d" : ws.status === "PV_RAISED" ? "#1d4ed8" : "#4b5563" },
            ]}>{ws.status.replace(/_/g, " ")}</Text>
          </View>
        </View>

        {/* Worker summary */}
        <View style={[s.row, { marginBottom: 14, gap: 10 }]}>
          <View style={{ flex: 1, padding: "8pt 10pt", backgroundColor: "#f8fafc", borderRadius: 3 }}>
            <Text style={[s.tiny, s.muted]}>Worker Type</Text>
            <Text style={[s.bold, s.small, { marginTop: 2 }]}>{WORKER_TYPE_LABEL[ws.worker_type] ?? ws.worker_type}</Text>
          </View>
          <View style={{ flex: 1, padding: "8pt 10pt", backgroundColor: "#f8fafc", borderRadius: 3 }}>
            <Text style={[s.tiny, s.muted]}>Worker Name</Text>
            <Text style={[s.bold, s.small, { marginTop: 2 }]}>{ws.worker_name}</Text>
          </View>
          <View style={{ flex: 1, padding: "8pt 10pt", backgroundColor: "#f8fafc", borderRadius: 3 }}>
            <Text style={[s.tiny, s.muted]}>Period</Text>
            <Text style={[s.bold, s.small, { marginTop: 2 }]}>{ws.period_label}</Text>
          </View>
        </View>

        {/* Entries table */}
        <View style={[s.tableFrame, { marginBottom: 12 }]}>
          <View style={[s.row, s.tableRow, s.headerBg]}>
            <Text style={[s.cell, s.bold, s.tiny, s.headerText, { flex: COL.date, borderRightColor: "#7b98c9" }]}>Date</Text>
            <Text style={[s.cell, s.bold, s.tiny, s.headerText, { flex: COL.time, borderRightColor: "#7b98c9" }]}>Time</Text>
            <Text style={[s.cell, s.bold, s.tiny, s.headerText, s.right, { flex: COL.hours, borderRightColor: "#7b98c9" }]}>Hours</Text>
            <Text style={[s.cellLast, s.bold, s.tiny, s.headerText, { flex: COL.purpose }]}>Purpose / Remarks</Text>
          </View>
          {ws.entries.map((e, i) => {
            const isLast = i === ws.entries.length - 1;
            const rowStyle = isLast ? {} : s.tableRow;
            return (
              <View key={i} style={[s.row, rowStyle]}>
                <Text style={[s.cell, s.tiny, { flex: COL.date }]}>{fmtDate(e.date)}</Text>
                <Text style={[s.cell, s.tiny, { flex: COL.time }]}>{e.start_time && e.end_time ? `${e.start_time}–${e.end_time}` : "—"}</Text>
                <Text style={[s.cell, s.tiny, s.right, { flex: COL.hours }]}>{e.hours}</Text>
                <Text style={[s.cellLast, s.tiny, { flex: COL.purpose }]}>{e.purpose || ""}</Text>
              </View>
            );
          })}
        </View>

        {/* Summary — a standalone total block, not forced into the entry columns */}
        <View style={[s.row, { justifyContent: "flex-end", marginBottom: 14 }]}>
          <View style={{ width: "45%", border: "0.8pt solid #1f2937", borderRadius: 3, overflow: "hidden" }}>
            <View style={[s.row, { justifyContent: "space-between", padding: "5pt 8pt", borderBottom: "0.8pt solid #e5e7eb" }]}>
              <Text style={s.tiny}>Total Hours</Text>
              <Text style={[s.tiny, s.bold]}>{ws.total_hours}</Text>
            </View>
            <View style={[s.row, { justifyContent: "space-between", padding: "5pt 8pt", borderBottom: "0.8pt solid #e5e7eb" }]}>
              <Text style={s.tiny}>{ws.worker_type === "PA_PERSONNEL" || ws.worker_type === "RELA_PERSONNEL" ? "Rate per Session (RM)" : "Rate per Hour (RM)"}</Text>
              <Text style={[s.tiny, s.bold]}>{fmt(ws.rate_per_hour)}</Text>
            </View>
            <View style={[s.row, { justifyContent: "space-between", padding: "6pt 8pt", backgroundColor: "#f8fafc" }]}>
              <Text style={[s.small, s.bold]}>Total Amount (RM)</Text>
              <Text style={[s.small, s.bold, { color: ACCENT }]}>{fmt(ws.total_amount)}</Text>
            </View>
          </View>
        </View>

        {ws.notes ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={[s.tiny, s.muted]}>Notes</Text>
            <Text style={[s.small, { marginTop: 2 }]}>{ws.notes}</Text>
          </View>
        ) : null}

        <Text style={[s.tiny, s.muted, { marginBottom: 6 }]}>
          I/We confirm the hours worked and amount stated above are true and correct.
        </Text>
        <View style={[s.row, { border: "0.8pt solid #1f2937", borderRadius: 3 }]}>
          <View style={{ flex: 1, borderRight: "0.8pt solid #1f2937" }}>
            <SigBox label="Worker's Signature" signature={ws.worker_signature} signedBy={ws.worker_name} signedAt={ws.worker_signed_at} />
          </View>
          <View style={{ flex: 1 }}>
            <SigBox label="Verified by — Building/Event Manager" signature={ws.bem_signature} signedBy={ws.bem_signed_by} signedAt={ws.bem_signed_at} />
          </View>
        </View>
      </Page>
    </Document>
  );
}

export async function generateWorksheetPdfBlob(ws: WorkerWorksheet): Promise<Blob> {
  const logoDataUri = await svgToPngDataUri("/lcm-logo.svg", 160).catch(() => "");
  return pdf(<WorksheetDocument ws={ws} logoDataUri={logoDataUri} />).toBlob();
}
