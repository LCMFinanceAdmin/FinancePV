"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { PV, PVApproval } from "@/lib/types";
import { getLOATier } from "@/lib/utils";
import {
  pdf, Document, Page, Text, View, StyleSheet, Image, Font,
} from "@react-pdf/renderer";

/** Convert an SVG file at /lcm-logo.svg to a PNG data URI usable by react-pdf */
async function svgToPngDataUri(svgPath: string, size = 200): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.drawImage(img, 0, 0, size, size); }
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(""); // fail silently
    img.src = svgPath;
  });
}

Font.register({
  family: "Arial",
  fonts: [
    { src: "https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0C24.woff2", fontWeight: 400 },
    { src: "https://fonts.gstatic.com/s/opensans/v34/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B24.woff2", fontWeight: 700 },
  ],
});

const BANK_ABBR: Record<string, string> = {
  "maybank": "MBB", "cimb": "CIMB", "cimb bank": "CIMB",
  "public bank": "PBB", "rhb": "RHB", "hong leong bank": "HLB",
  "ambank": "AMB", "bank islam": "BIMB", "bank rakyat": "BPR",
  "ocbc": "OCBC", "standard chartered": "SCB", "affin bank": "AFFIN",
  "alliance bank": "ABB", "uob": "UOB", "bsn": "BSN",
};

function getBankAbbr(name: string) {
  return BANK_ABBR[(name || "").toLowerCase().trim()] ?? name;
}

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function fmtDate(s?: string | null) {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s.slice(0, 10);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

const s = StyleSheet.create({
  page:        { fontFamily: "Helvetica", fontSize: 9, padding: "10mm", color: "#000" },
  row:         { flexDirection: "row" },
  bold:        { fontFamily: "Helvetica-Bold" },
  border:      { border: "1pt solid #000" },
  borderT:     { borderTop: "1pt solid #000" },
  borderB:     { borderBottom: "1pt solid #000" },
  cell:        { padding: "4pt 6pt", border: "1pt solid #000" },
  headerBg:    { backgroundColor: "#f0f0f0" },
  center:      { textAlign: "center" },
  right:       { textAlign: "right" },
  tiny:        { fontSize: 7 },
  small:       { fontSize: 8 },
  finHeader:   { backgroundColor: "#000", color: "#fff", textAlign: "center", fontSize: 8, fontFamily: "Helvetica-Bold", padding: "3pt" },
});

function PVDocument({ pv, logoDataUri }: { pv: PV; logoDataUri?: string }) {
  const items = pv.line_items ?? [];
  const approvals: PVApproval[] = pv.approvals ?? [];
  const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0) || pv.amount;
  const padRows = Math.max(0, 5 - items.length);
  const loa = getLOATier(pv.amount, pv.payment_type);

  const bankLine = pv.payment_method?.toLowerCase() === "jompay"
    ? `Biller: ${pv.biller_code ?? "—"} | Ref: ${pv.ref_no ?? "—"}`
    : pv.payee_bank_name
      ? `${getBankAbbr(pv.payee_bank_name)}${pv.payee_bank_acct ? " | " + pv.payee_bank_acct : ""}`
      : "";

  const projectLabel = [pv.ministry, pv.dept, pv.project].filter(Boolean).join(" / ");

  const gmApproval = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
  const sigApprovals = approvals.filter(a =>
    ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
  );

  const ministryVerified =
    String(pv.ministry_verified ?? "").toUpperCase() === "YES" ||
    String(pv.head_verified ?? "").toUpperCase() === "YES";

  return (
    <Document title={`PV ${pv.pv_no}`}>
      <Page size="A4" style={s.page}>

        {/* Row 1: Logo + Office Use */}
        <View style={[s.row, { marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <View style={s.row}>
              <View style={{ width: 55 }}>
                {logoDataUri ? (
                  <Image src={logoDataUri} style={{ width: 50, height: 50 }} />
                ) : null}
              </View>
              <View style={{ flex: 1, paddingLeft: 6 }}>
                <Text style={[s.bold, { fontSize: 11 }]}>LUTHERAN CHURCH IN MALAYSIA</Text>
                <Text style={[s.tiny, { color: "#555" }]}>(ROS: PPM-001-10-09031964)</Text>
                <Text style={[s.tiny, { marginTop: 2 }]}>Luther Centre, No. 6, Jalan Utara, 46200 Petaling Jaya, Selangor</Text>
                <Text style={s.tiny}>Tel: 03-7956 5992  Fax: 03-7957 6953  Email: finance@lcm.org.my</Text>
              </View>
            </View>
          </View>
          <View style={[s.border, { width: 130, padding: "5pt 8pt", alignItems: "center" }]}>
            <Text style={[s.bold, s.tiny, { borderBottom: "1pt solid #000", width: "100%", textAlign: "center", paddingBottom: 2, marginBottom: 3 }]}>FOR OFFICE USE ONLY</Text>
            {pv.pv_label ? (
              <Text style={[s.bold, { fontSize: 18, letterSpacing: 1 }]}>{pv.pv_label.split(" - ")[0]}</Text>
            ) : (
              <Text style={[s.tiny, { color: "#bbb", fontStyle: "italic" }]}>Not labelled</Text>
            )}
            <Text style={[s.tiny, { marginTop: 4, alignSelf: "flex-start" }]}>Ref: <Text style={s.bold}>{pv.pv_no}</Text></Text>
          </View>
        </View>

        {/* Title */}
        <Text style={[s.bold, s.center, { fontSize: 10, marginBottom: 1 }]}>LUTHERAN CHURCH IN MALAYSIA</Text>
        <Text style={[s.center, { fontSize: 9, marginBottom: 6 }]}>(REIMBURSEMENT CLAIM FORM / PAYMENT VOUCHER){"\n"}
          <Text style={s.tiny}>马来西亚基督教信义会（费用报销 / 付款凭证表格）</Text>
        </Text>

        {/* Info grid */}
        <View style={[s.border, { marginBottom: 6 }]}>
          <View style={s.row}>
            <View style={[s.cell, { flex: 2 }]}>
              <Text style={s.tiny}>Applicant 申请者:  <Text style={s.bold}>{pv.applicant_name || pv.submitted_by}</Text></Text>
            </View>
            <View style={[s.cell, { flex: 1 }]}>
              <Text style={s.tiny}>Date 日期:  <Text style={s.bold}>{fmtDate(pv.date ?? pv.submitted_at)}</Text></Text>
            </View>
          </View>
          <View style={s.cell}><Text style={s.tiny}>Payable to 付给:  <Text style={s.bold}>{pv.payee_name}</Text></Text></View>
          <View style={s.cell}><Text style={s.tiny}>Payee Bank A/C No 收款人账户号码:  {bankLine}</Text></View>
          <View style={s.cell}><Text style={s.tiny}>Project 事工:  {projectLabel}</Text></View>
          <View style={s.cell}><Text style={s.tiny}>Purpose 用途:  {pv.purpose}</Text></View>
          {pv.exco_resolution_ref ? (
            <View style={[s.cell, { backgroundColor: "#fef3c7" }]}>
              <Text style={[s.tiny, s.bold]}>EXCO Resolution Ref: {pv.exco_resolution_ref}{pv.exco_resolution_date ? `  dated ${pv.exco_resolution_date}` : ""}</Text>
            </View>
          ) : null}
        </View>

        {/* Line items */}
        <View style={[s.border, { marginBottom: 0 }]}>
          <View style={[s.row, s.headerBg]}>
            <View style={[s.cell, { width: 24, ...s.center }]}><Text style={[s.bold, s.tiny]}>#</Text></View>
            <View style={[s.cell, { width: 75 }]}><Text style={[s.bold, s.tiny]}>Date 日期</Text></View>
            <View style={[s.cell, { flex: 1 }]}><Text style={[s.bold, s.tiny]}>PARTICULARS</Text></View>
            <View style={[s.cell, { width: 75, ...s.right }]}><Text style={[s.bold, s.tiny]}>Amount (RM)</Text></View>
          </View>
          {items.map((item, i) => (
            <View key={i} style={s.row}>
              <View style={[s.cell, { width: 24, ...s.center }]}><Text>{i + 1}</Text></View>
              <View style={[s.cell, { width: 75 }]}><Text>{item.date ? fmtDate(item.date) : ""}</Text></View>
              <View style={[s.cell, { flex: 1 }]}><Text>{item.description}</Text></View>
              <View style={[s.cell, { width: 75, ...s.right }]}><Text>{fmt(Number(item.amount) || 0)}</Text></View>
            </View>
          ))}
          {Array.from({ length: padRows }).map((_, i) => (
            <View key={`pad-${i}`} style={s.row}>
              <View style={[s.cell, { width: 24 }]}><Text> </Text></View>
              <View style={[s.cell, { width: 75 }]}><Text> </Text></View>
              <View style={[s.cell, { flex: 1 }]}><Text> </Text></View>
              <View style={[s.cell, { width: 75 }]}><Text> </Text></View>
            </View>
          ))}
          <View style={s.row}>
            <View style={[s.cell, { flex: 1, ...s.right }]}><Text style={s.bold}>Total 总数:</Text></View>
            <View style={[s.cell, { width: 75, ...s.right }]}><Text style={s.bold}>RM {fmt(total)}</Text></View>
          </View>
        </View>

        {/* Applicant signature */}
        <View style={[s.border, { marginTop: 8, padding: "6pt 8pt" }]}>
          <Text style={[s.bold, s.tiny, { marginBottom: 3 }]}>Applicant{"'"}s Signature 申请者签名:</Text>
          <View style={{ height: 40 }} />
          <View style={[s.borderT, { paddingTop: 3 }]}>
            <Text style={s.tiny}>Name: <Text style={s.bold}>{pv.sig_applicant_name || pv.applicant_name}</Text>    Date: {fmtDate(pv.submitted_at)}</Text>
          </View>
        </View>

        {/* Ministry/Dept Head verification */}
        <View style={[s.border, { marginTop: 6, padding: "6pt 8pt" }]}>
          <Text style={[s.bold, s.tiny, { marginBottom: 1 }]}>Verified/Approved by 审核/批准者签名:</Text>
          <Text style={[s.tiny, { color: "#555", marginBottom: 4 }]}>(By Chairperson/Person in Charge 事工执行主席/主管)</Text>
          {ministryVerified ? (
            <>
              <View style={{ height: 40 }} />
              <View style={[s.borderT, { paddingTop: 3 }]}>
                <Text style={[s.bold, s.tiny]}>{pv.ministry_verified_by ?? "Ministry Head"}</Text>
                <Text style={s.tiny}>{pv.ministry}  Date: {fmtDate(pv.ministry_verified_at ?? pv.head_verified_at)}</Text>
              </View>
            </>
          ) : (
            <Text style={[s.tiny, { color: "#999", height: 40 }]}>Pending</Text>
          )}
        </View>

        {/* Finance section */}
        <View style={{ marginTop: 8 }}>
          <View style={s.finHeader}><Text>For LCM Finance Office Use Only （供LCM财政部使用）</Text></View>
          <View style={[s.row, s.border, { borderTop: "none" }]}>
            {/* Finance Admin */}
            <View style={[{ flex: 1, padding: "6pt 8pt", borderRight: "1pt solid #000" }]}>
              <Text style={[s.bold, s.tiny, { borderBottom: "1pt solid #000", paddingBottom: 2, marginBottom: 4 }]}>Checked &amp; Verified by:</Text>
              <View style={{ height: 40 }} />
              <View style={[s.borderT, { paddingTop: 3 }]}>
                <Text style={s.tiny}>Name: <Text style={s.bold}>{pv.finance_verified_by ?? ""}</Text></Text>
                <Text style={s.tiny}>Date: {fmtDate(pv.finance_verified_at)}</Text>
              </View>
            </View>
            {/* General Manager */}
            <View style={[{ flex: 1, padding: "6pt 8pt", borderRight: "1pt solid #000" }]}>
              <View style={[s.borderB, { paddingBottom: 2, marginBottom: 4 }]}>
                <Text style={[s.bold, s.tiny]}>Approved by:</Text>
                <Text style={s.tiny}>(General Manager)</Text>
              </View>
              <View style={{ height: 40 }} />
              <View style={[s.borderT, { paddingTop: 3 }]}>
                {gmApproval ? (
                  <>
                    <Text style={[s.bold, s.tiny]}>{gmApproval.name || gmApproval.email}</Text>
                    <Text style={s.tiny}>Date: {fmtDate(gmApproval.timestamp)}</Text>
                  </>
                ) : (
                  <Text style={[s.tiny, { color: "#bbb" }]}>Pending approval</Text>
                )}
              </View>
            </View>
            {/* Authorised Signatory */}
            <View style={[{ flex: 1, padding: "6pt 8pt" }]}>
              <View style={[s.borderB, { paddingBottom: 2, marginBottom: 4 }]}>
                <Text style={[s.bold, s.tiny]}>Authorised Signatory:</Text>
                <Text style={s.tiny}>({loa.label})</Text>
              </View>
              <View style={s.row}>
                {Array.from({ length: loa.required }).map((_, i) => {
                  const appr = sigApprovals[i];
                  return (
                    <View key={i} style={{ flex: 1, alignItems: "center", paddingHorizontal: 2 }}>
                      <View style={{ height: 40 }} />
                      <View style={[s.borderT, { paddingTop: 3, width: "100%", alignItems: "center" }]}>
                        {appr ? (
                          <>
                            <Text style={[s.bold, s.tiny]}>{appr.name || appr.email}</Text>
                            <Text style={s.tiny}>{appr.role}</Text>
                            <Text style={s.tiny}>Date: {fmtDate(appr.timestamp)}</Text>
                          </>
                        ) : (
                          <Text style={[s.tiny, { color: "#ccc" }]}>___________</Text>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          </View>
        </View>

        {/* Remarks from rejections */}
        {approvals.filter(a => a.remarks).length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={[s.bold, s.tiny, { marginBottom: 2 }]}>Remarks:</Text>
            {approvals.filter(a => a.remarks).map((a, i) => (
              <Text key={i} style={s.tiny}>{a.role} ({a.name}): {a.remarks}</Text>
            ))}
          </View>
        )}

      </Page>
    </Document>
  );
}

export default function PVPdfDownload({ pv }: { pv: PV }) {
  const [loading, setLoading] = useState(false);
  const [logoDataUri, setLogoDataUri] = useState("");

  useEffect(() => {
    svgToPngDataUri("/lcm-logo.svg", 200).then(setLogoDataUri);
  }, []);

  async function download() {
    setLoading(true);
    try {
      const logo = logoDataUri || await svgToPngDataUri("/lcm-logo.svg", 200);
      const blob = await pdf(<PVDocument pv={pv} logoDataUri={logo} />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${pv.pv_no}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="secondary" size="sm" onClick={download} loading={loading}>
      <Download size={14} /> PDF
    </Button>
  );
}
