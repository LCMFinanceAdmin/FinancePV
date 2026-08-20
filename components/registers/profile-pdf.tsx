"use client";
// One person's official record, on a page.
//
// The other three registers are lists. This is the opposite question — a bank
// or an embassy asking about one named employee — and a one-row extract of the
// staff list does not answer it. It reads as a record sheet: who they are, what
// they were engaged as, what the church pays them, and which posts they hold.
//
// Same masthead, footer and certification block as the registers, because it is
// shared in the same way and relied on for the same reasons.

import {
  pdf, Document, Page, Text, View, Image, StyleSheet,
} from "@react-pdf/renderer";
import { type RegisterMeta, fmtDate, fmtDateTime } from "@/lib/registers";

const INK = "#16335e";
const LINE = "#c7d8ef";
const MUTED = "#667994";

export interface ProfileField { label: string; value: string }
export interface ProfileSection { heading: string; fields: ProfileField[] }
export interface ProfileTable { heading: string; columns: string[]; rows: string[][] }

export interface EmployeeProfile {
  name: string;
  /** Designation and employee number — what identifies them on paper. */
  subtitle: string;
  sections: ProfileSection[];
  tables?: ProfileTable[];
  note?: string;
}

const S = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 52, paddingHorizontal: 32, fontSize: 9, color: INK },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12,
          borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 6 },
  logo: { width: 34, height: 34 },
  org: { fontSize: 11, fontWeight: "bold" },
  title: { fontSize: 14, fontWeight: "bold", marginTop: 1 },
  asAt: { fontSize: 9, fontWeight: "bold", textAlign: "right" },

  nameBlock: { marginBottom: 12, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: LINE },
  name: { fontSize: 16, fontWeight: "bold" },
  subtitle: { fontSize: 9, color: MUTED, marginTop: 2 },

  section: { marginBottom: 12 },
  heading: { fontSize: 8, fontWeight: "bold", letterSpacing: 0.6, color: MUTED,
             marginBottom: 5, textTransform: "uppercase" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  field: { width: "50%", paddingRight: 12, marginBottom: 7 },
  label: { fontSize: 7, color: MUTED, marginBottom: 1.5 },
  value: { fontSize: 9.5 },

  tHeader: { flexDirection: "row", backgroundColor: INK },
  tHeaderCell: { color: "#ffffff", fontSize: 7.5, fontWeight: "bold",
                 paddingVertical: 3.5, paddingHorizontal: 4 },
  tRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE },
  tCell: { fontSize: 8, paddingVertical: 3.5, paddingHorizontal: 4 },

  note: { marginTop: 4, fontSize: 7.5, color: MUTED },
  certify: { marginTop: 24, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 10 },
  certifyLead: { fontSize: 7.5, color: MUTED, marginBottom: 16 },
  signRow: { flexDirection: "row", gap: 28 },
  signBox: { flex: 1 },
  signLine: { borderBottomWidth: 0.7, borderBottomColor: INK, height: 22 },
  signLabel: { fontSize: 7, color: MUTED, marginTop: 3 },

  footer: { position: "absolute", left: 32, right: 32, bottom: 22,
            borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5,
            flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 6.5, color: MUTED },
});

export function ProfileDocument({ profile, meta, logo }: {
  profile: EmployeeProfile; meta: RegisterMeta; logo?: string;
}) {
  return (
    <Document title={`${profile.name} — Employee Record`} author={meta.organisation}>
      <Page size="A4" style={S.page} wrap>
        <View style={S.head} fixed>
          {logo ? <Image src={logo} style={S.logo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={S.org}>{meta.organisation}</Text>
            <Text style={S.title}>Employee Record</Text>
          </View>
          <Text style={S.asAt}>As at {fmtDate(meta.asAt)}</Text>
        </View>

        <View style={S.nameBlock}>
          <Text style={S.name}>{profile.name}</Text>
          <Text style={S.subtitle}>{profile.subtitle}</Text>
        </View>

        {profile.sections.map(sec => (
          <View key={sec.heading} style={S.section} wrap={false}>
            <Text style={S.heading}>{sec.heading}</Text>
            <View style={S.grid}>
              {sec.fields.map(f => (
                <View key={f.label} style={S.field}>
                  <Text style={S.label}>{f.label}</Text>
                  <Text style={S.value}>{f.value || "—"}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        {(profile.tables ?? []).map(t => (
          <View key={t.heading} style={S.section}>
            <Text style={S.heading}>{t.heading}</Text>
            <View style={S.tHeader}>
              {t.columns.map((c, i) => (
                <Text key={c} style={[S.tHeaderCell, { width: `${100 / t.columns.length}%` }]}>{c}</Text>
              ))}
            </View>
            {t.rows.length === 0 ? (
              <Text style={{ fontSize: 8, color: MUTED, paddingVertical: 5 }}>None recorded.</Text>
            ) : t.rows.map((r, ri) => (
              <View key={ri} style={S.tRow} wrap={false}>
                {r.map((v, ci) => (
                  <Text key={ci} style={[S.tCell, { width: `${100 / t.columns.length}%` }]}>{v || "—"}</Text>
                ))}
              </View>
            ))}
          </View>
        ))}

        {profile.note ? <Text style={S.note}>{profile.note}</Text> : null}

        <View style={S.certify} wrap={false}>
          <Text style={S.certifyLead}>
            Certified a true extract of the records of {meta.organisation} as at {fmtDate(meta.asAt)}.
          </Text>
          <View style={S.signRow}>
            <View style={S.signBox}>
              <View style={S.signLine} />
              <Text style={S.signLabel}>Name, designation and date</Text>
            </View>
            <View style={S.signBox}>
              <View style={S.signLine} />
              <Text style={S.signLabel}>Signature and church stamp</Text>
            </View>
          </View>
        </View>

        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            Generated by {meta.generatedBy} on {fmtDateTime(meta.generatedAt)}
          </Text>
          <Text style={S.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export async function buildProfilePdf(
  profile: EmployeeProfile, meta: RegisterMeta, logo?: string,
): Promise<Blob> {
  return pdf(<ProfileDocument profile={profile} meta={meta} logo={logo} />).toBlob();
}

/** The profile as a two-column sheet, for anyone who wants it in a spreadsheet. */
export async function buildProfileWorkbook(
  profile: EmployeeProfile, meta: RegisterMeta,
): Promise<Blob> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.organisation;
  const ws = wb.addWorksheet("Employee Record");
  ws.columns = [{ width: 28 }, { width: 46 }];

  const title = ws.addRow([meta.organisation]);
  title.font = { bold: true, size: 12 };
  const t2 = ws.addRow(["Employee Record"]);
  t2.font = { bold: true, size: 14 };
  ws.addRow([profile.name]).font = { bold: true, size: 11 };
  ws.addRow([profile.subtitle]).font = { size: 10, color: { argb: "FF6B7280" } };
  ws.addRow([`As at ${fmtDate(meta.asAt)}`]).font = { bold: true, size: 10 };
  ws.addRow([]);

  for (const sec of profile.sections) {
    const h = ws.addRow([sec.heading.toUpperCase()]);
    h.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    h.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A6DA7" } }; });
    ws.mergeCells(h.number, 1, h.number, 2);
    for (const f of sec.fields) {
      const r = ws.addRow([f.label, f.value || "—"]);
      r.getCell(1).font = { size: 9, color: { argb: "FF6B7280" } };
      r.getCell(2).font = { size: 10 };
      r.getCell(2).alignment = { wrapText: true };
    }
    ws.addRow([]);
  }

  for (const t of profile.tables ?? []) {
    const h = ws.addRow([t.heading.toUpperCase()]);
    h.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    h.eachCell(c => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A6DA7" } }; });
    ws.mergeCells(h.number, 1, h.number, 2);
    const head = ws.addRow(t.columns);
    head.font = { bold: true, size: 9 };
    for (const r of t.rows) ws.addRow(r).font = { size: 9 };
    ws.addRow([]);
  }

  const prov = ws.addRow([
    `Generated from the ${meta.organisation} finance system by ${meta.generatedBy} on ${fmtDateTime(meta.generatedAt)}.`,
  ]);
  prov.font = { size: 9, italic: true, color: { argb: "FF6B7280" } };
  ws.mergeCells(prov.number, 1, prov.number, 2);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
