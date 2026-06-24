import { pdf, Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";
import type { WorkerWorksheet } from "@/lib/types";
import { svgToPngDataUri } from "@/components/pv/pv-pdf-download";

const WORKER_TYPE_LABEL: Record<string, string> = {
  PA_PERSONNEL: "PA Personnel",
  BUILDING_CARE_TAKER: "Building Care Taker",
  RELA_PERSONNEL: "RELA Personnel",
};

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
  page:      { fontFamily: "Helvetica", fontSize: 11, padding: "12mm", color: "#000" },
  row:       { flexDirection: "row" },
  bold:      { fontFamily: "Helvetica-Bold" },
  border:    { border: "1pt solid #000" },
  borderT:   { borderTop: "1pt solid #000" },
  borderB:   { borderBottom: "1pt solid #000" },
  cell:      { padding: "4pt 6pt", border: "0.7pt solid #000" },
  headerBg:  { backgroundColor: "#f0f0f0" },
  center:    { textAlign: "center" },
  right:     { textAlign: "right" },
  tiny:      { fontSize: 9 },
  small:     { fontSize: 10 },
});

function SigBox({ label, signature, signedBy, signedAt }: { label: string; signature?: string | null; signedBy?: string | null; signedAt?: string | null }) {
  return (
    <View style={{ flex: 1, padding: "6pt 8pt" }}>
      <Text style={[s.bold, s.tiny]}>{label}</Text>
      {signature ? (
        <Image src={signature} style={{ height: 40, marginTop: 4, objectFit: "contain", objectPositionX: "left" }} />
      ) : (
        <View style={{ height: 44 }} />
      )}
      <View style={[s.borderT, { paddingTop: 3, marginTop: 4 }]}>
        {signedBy ? <Text style={s.tiny}>{signedBy}</Text> : null}
        <Text style={[s.tiny, { color: "#666" }]}>{signedAt ? `Signed: ${fmtDateTime(signedAt)}` : "Pending signature"}</Text>
      </View>
    </View>
  );
}

function WorksheetDocument({ ws, logoDataUri }: { ws: WorkerWorksheet; logoDataUri: string }) {
  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={[s.row, { alignItems: "center", justifyContent: "space-between", paddingBottom: 8, marginBottom: 10, borderBottom: "2pt solid #000" }]}>
          <View style={[s.row, { alignItems: "center", gap: 8 }]}>
            {logoDataUri ? <Image src={logoDataUri} style={{ width: 40, height: 40 }} /> : null}
            <View>
              <Text style={[s.bold, { fontSize: 12 }]}>Lutheran Church in Malaysia</Text>
              <Text style={s.tiny}>Building / Event Management — Extra Worker Worksheet</Text>
            </View>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[s.bold, s.small]}>{ws.worksheet_no}</Text>
            <Text style={s.tiny}>Status: {ws.status}</Text>
          </View>
        </View>

        <View style={[s.row, { marginBottom: 10 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.tiny}>Worker Type</Text>
            <Text style={[s.bold, s.small]}>{WORKER_TYPE_LABEL[ws.worker_type] ?? ws.worker_type}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.tiny}>Worker Name</Text>
            <Text style={[s.bold, s.small]}>{ws.worker_name}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.tiny}>Period</Text>
            <Text style={[s.bold, s.small]}>{ws.period_label}</Text>
          </View>
        </View>

        <View style={[s.border, { marginBottom: 10 }]}>
          <View style={[s.row, s.headerBg]}>
            <Text style={[s.cell, s.bold, s.tiny, { flex: 2 }]}>Date</Text>
            <Text style={[s.cell, s.bold, s.tiny, { flex: 1, textAlign: "right" }]}>Hours</Text>
          </View>
          {ws.entries.map((e, i) => (
            <View key={i} style={s.row}>
              <Text style={[s.cell, s.tiny, { flex: 2 }]}>{ws.period_type === "MONTH" ? ws.period_label : fmtDate(e.date)}</Text>
              <Text style={[s.cell, s.tiny, { flex: 1, textAlign: "right" }]}>{e.hours}</Text>
            </View>
          ))}
          <View style={[s.row, s.headerBg]}>
            <Text style={[s.cell, s.bold, s.tiny, { flex: 2 }]}>Total Hours</Text>
            <Text style={[s.cell, s.bold, s.tiny, { flex: 1, textAlign: "right" }]}>{ws.total_hours}</Text>
          </View>
          <View style={s.row}>
            <Text style={[s.cell, s.tiny, { flex: 2 }]}>Rate per Hour (RM)</Text>
            <Text style={[s.cell, s.tiny, { flex: 1, textAlign: "right" }]}>{fmt(ws.rate_per_hour)}</Text>
          </View>
          <View style={[s.row, s.headerBg]}>
            <Text style={[s.cell, s.bold, s.tiny, { flex: 2 }]}>Total Amount (RM)</Text>
            <Text style={[s.cell, s.bold, s.tiny, { flex: 1, textAlign: "right" }]}>{fmt(ws.total_amount)}</Text>
          </View>
        </View>

        {ws.notes ? (
          <View style={{ marginBottom: 10 }}>
            <Text style={s.tiny}>Notes</Text>
            <Text style={s.small}>{ws.notes}</Text>
          </View>
        ) : null}

        <Text style={[s.tiny, { marginBottom: 4 }]}>
          I/We confirm the hours worked and amount stated above are true and correct.
        </Text>
        <View style={[s.row, s.border]}>
          <View style={{ flex: 1, borderRight: "0.7pt solid #000" }}>
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
