"use client";
// A register as a PDF — the copy that gets signed and filed.
//
// Driven by the same column definitions the spreadsheet uses, so the two cannot
// disagree about what is in column four.
//
// Three things make it an official document rather than a printout. The header
// repeats on every page, so page four is still identifiably part of the same
// register. The footer carries who generated it, when, and "page x of y", so a
// page separated from the rest can be placed and a short print can be spotted.
// And it ends with a certification block: somebody in the church puts their
// name to it, which is what the recipient is actually relying on.

import {
  pdf, Document, Page, Text, View, Image, StyleSheet,
} from "@react-pdf/renderer";
import {
  type Register, type RegisterMeta, totalsRow, fmtDate, fmtDateTime, fmtMoney,
} from "@/lib/registers";

const INK = "#16335e";
const LINE = "#c7d8ef";
const MUTED = "#667994";

const S = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 52, paddingHorizontal: 28, fontSize: 8, color: INK },
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8,
          borderBottomWidth: 1.5, borderBottomColor: INK, paddingBottom: 6 },
  logo: { width: 34, height: 34 },
  org: { fontSize: 11, fontWeight: "bold" },
  title: { fontSize: 14, fontWeight: "bold", marginTop: 1 },
  purpose: { fontSize: 8, color: MUTED, marginTop: 2 },
  asAt: { fontSize: 9, fontWeight: "bold", textAlign: "right" },
  asAtSmall: { fontSize: 7.5, color: MUTED, textAlign: "right", marginTop: 2 },

  headerRow: { flexDirection: "row", backgroundColor: INK },
  headerCell: { color: "#ffffff", fontSize: 7.5, fontWeight: "bold",
                paddingVertical: 4, paddingHorizontal: 3,
                borderRightWidth: 0.5, borderRightColor: "#ffffff" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE },
  rowAlt: { backgroundColor: "#f6faff" },
  cell: { fontSize: 7.5, paddingVertical: 3.5, paddingHorizontal: 3,
          borderRightWidth: 0.5, borderRightColor: LINE },
  totalRow: { flexDirection: "row", backgroundColor: "#eef4fc",
              borderTopWidth: 1.2, borderTopColor: INK, borderBottomWidth: 1, borderBottomColor: INK },
  totalCell: { fontSize: 8, fontWeight: "bold", paddingVertical: 4, paddingHorizontal: 3 },

  note: { marginTop: 8, fontSize: 7.5, color: MUTED },
  count: { marginTop: 8, fontSize: 8, fontWeight: "bold" },

  certify: { marginTop: 22, borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 10 },
  certifyLead: { fontSize: 7.5, color: MUTED, marginBottom: 16 },
  signRow: { flexDirection: "row", gap: 28 },
  signBox: { flex: 1 },
  signLine: { borderBottomWidth: 0.7, borderBottomColor: INK, height: 22 },
  signLabel: { fontSize: 7, color: MUTED, marginTop: 3 },

  footer: { position: "absolute", left: 28, right: 28, bottom: 22,
            borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 5,
            flexDirection: "row", justifyContent: "space-between" },
  footerText: { fontSize: 6.5, color: MUTED },
});

function cellText(value: unknown, money?: boolean): string {
  if (value === null || value === undefined || value === "") return "—";
  if (money && typeof value === "number") return fmtMoney(value);
  return String(value);
}

export function RegisterDocument({ reg, meta, logo }: {
  reg: Register; meta: RegisterMeta; logo?: string;
}) {
  const totalFlex = reg.columns.reduce((s, c) => s + c.flex, 0);
  const widths = reg.columns.map(c => `${(c.flex / totalFlex) * 100}%`);
  // Wide registers get a landscape page rather than eight columns squeezed into
  // portrait, where every one of them wraps.
  const landscape = reg.columns.length > 6;
  const totals = reg.totals && reg.rows.length > 0 ? totalsRow(reg) : null;

  return (
    <Document title={`${reg.title} — ${meta.organisation}`} author={meta.organisation}>
      <Page size="A4" orientation={landscape ? "landscape" : "portrait"} style={S.page} wrap>
        {/* fixed: this is the masthead, and page 4 of a register still needs
            to say which register it is. */}
        <View style={S.head} fixed>
          {logo ? <Image src={logo} style={S.logo} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={S.org}>{meta.organisation}</Text>
            <Text style={S.title}>{reg.title}</Text>
            <Text style={S.purpose}>{reg.purpose}</Text>
          </View>
          <View>
            <Text style={S.asAt}>As at {fmtDate(meta.asAt)}</Text>
            <Text style={S.asAtSmall}>{reg.rows.length} record{reg.rows.length === 1 ? "" : "s"}</Text>
          </View>
        </View>

        <View style={S.headerRow} fixed>
          {reg.columns.map((c, i) => (
            <Text key={c.header} style={[S.headerCell, { width: widths[i], textAlign: c.align ?? "left" }]}>
              {c.header}
            </Text>
          ))}
        </View>

        {reg.rows.length === 0 && (
          <Text style={{ fontSize: 8, color: MUTED, paddingVertical: 10, textAlign: "center" }}>
            Nothing on this register as at {fmtDate(meta.asAt)}.
          </Text>
        )}

        {reg.rows.map((r, ri) => (
          <View key={ri} style={[S.row, ri % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            {reg.columns.map((c, ci) => (
              <Text key={ci} style={[S.cell, { width: widths[ci], textAlign: c.align ?? "left" }]}>
                {cellText(r[ci], c.money)}
              </Text>
            ))}
          </View>
        ))}

        {totals && (
          <View style={S.totalRow} wrap={false}>
            {reg.columns.map((c, ci) => (
              <Text key={ci} style={[S.totalCell, { width: widths[ci], textAlign: c.money ? "right" : (c.align ?? "left") }]}>
                {c.money ? fmtMoney(Number(totals[ci] ?? 0)) : String(totals[ci] ?? "")}
              </Text>
            ))}
          </View>
        )}

        <Text style={S.count}>
          {reg.rows.length} record{reg.rows.length === 1 ? "" : "s"} on this register.
        </Text>
        {reg.note ? <Text style={S.note}>{reg.note}</Text> : null}

        {/* What makes it official: a person, not a system, standing behind it. */}
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

export async function buildRegisterPdf(reg: Register, meta: RegisterMeta, logo?: string): Promise<Blob> {
  return pdf(<RegisterDocument reg={reg} meta={meta} logo={logo} />).toBlob();
}
