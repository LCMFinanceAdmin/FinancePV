"use client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import type { PV, PVApproval } from "@/lib/types";
import { getLOATier, roleLabel } from "@/lib/utils";
import {
  pdf, Document, Page, Text, View, StyleSheet, Image, Font,
} from "@react-pdf/renderer";

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
    img.onerror = () => resolve("");
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
  page:      { fontFamily: "Helvetica", fontSize: 9, padding: "10mm", color: "#000" },
  row:       { flexDirection: "row" },
  bold:      { fontFamily: "Helvetica-Bold" },
  border:    { border: "1pt solid #000" },
  borderT:   { borderTop: "1pt solid #000" },
  borderB:   { borderBottom: "1pt solid #000" },
  cell:      { padding: "4pt 6pt", border: "1pt solid #000" },
  headerBg:  { backgroundColor: "#f0f0f0" },
  center:    { textAlign: "center" },
  right:     { textAlign: "right" },
  tiny:      { fontSize: 7 },
  small:     { fontSize: 8 },
  finHeader: { backgroundColor: "#000", color: "#fff", textAlign: "center", fontSize: 8, fontFamily: "Helvetica-Bold", padding: "3pt" },
});

function SigBox({ approval, label, subtitle }: { approval?: PVApproval; label: string; subtitle?: string }) {
  return (
    <View style={{ flex: 1, padding: "6pt 8pt" }}>
      <View style={[s.borderB, { paddingBottom: 2, marginBottom: 4 }]}>
        <Text style={[s.bold, s.tiny]}>{label}</Text>
        {subtitle ? <Text style={s.tiny}>{subtitle}</Text> : null}
      </View>
      {approval?.signature_data ? (
        <Image src={approval.signature_data} style={{ height: 40, objectFit: "contain", objectPositionX: "left" }} />
      ) : (
        <View style={{ height: 40 }} />
      )}
      <View style={[s.borderT, { paddingTop: 3 }]}>
        {approval ? (
          <>
            <Text style={[s.bold, s.tiny]}>{approval.name || approval.email}</Text>
            <Text style={s.tiny}>Date: {fmtDate(approval.timestamp)}</Text>
          </>
        ) : (
          <Text style={[s.tiny, { color: "#bbb" }]}>Pending</Text>
        )}
      </View>
    </View>
  );
}

function PaidBanner({ pv }: { pv: PV }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 12,
      border: "2pt solid #16a34a", borderRadius: 6,
      backgroundColor: "#f0fdf4", padding: "6pt 10pt",
    }}>
      <View style={{
        border: "3pt solid #16a34a", borderRadius: 4,
        padding: "4pt 10pt", transform: "rotate(-8deg)",
      }}>
        <Text style={{ fontSize: 16, fontFamily: "Helvetica-Bold", color: "#16a34a", letterSpacing: 3 }}>PAID</Text>
      </View>
      <View>
        <Text style={{ fontSize: 9, fontFamily: "Helvetica-Bold", color: "#166534" }}>Payment Completed</Text>
        <Text style={{ fontSize: 8, color: "#15803d", marginTop: 2 }}>
          {[
            pv.payment_method,
            pv.payment_ref && `Ref: ${pv.payment_ref}`,
            pv.paid_at && fmtDate(pv.paid_at),
          ].filter(Boolean).join("  ·  ")}
        </Text>
        {pv.paid_by ? (
          <Text style={{ fontSize: 8, color: "#15803d", marginTop: 1 }}>
            Marked paid by {pv.paid_by} (Finance Executive)
          </Text>
        ) : null}
      </View>
    </View>
  );
}

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

  const financeApproval = approvals.find(a => a.role === "FINANCE_ADMIN" && a.action === "APPROVED");
  const gmApproval      = approvals.find(a => a.role === "GENERAL_MANAGER" && a.action === "APPROVED");
  const sigApprovals    = approvals.filter(a =>
    ["BISHOP", "TREASURER", "SECRETARY"].includes(a.role) && a.action === "APPROVED"
  );
  const excoApproval    = approvals.find(a => a.role === "MINISTRY_HEAD" && a.action === "APPROVED");

  const ministryVerified =
    String(pv.ministry_verified ?? "").toUpperCase() === "YES" ||
    String(pv.head_verified ?? "").toUpperCase() === "YES" ||
    !!excoApproval;

  const isPaid = pv.status === "PAID";

  // Determine submitter role to conditionally show sections
  const financeRoles = ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"];
  const isFinanceExecPV = financeRoles.includes(pv.submitted_by_role ?? "");
  const isExcoPV = pv.submitted_by_role === "MINISTRY_HEAD";
  // Staff/general stakeholders sign the applicant section; Finance Exec & EXCO Members do not
  const showApplicantSig = !isFinanceExecPV && !isExcoPV;
  // EXCO verification section is hidden only for Finance Executive PVs (they go straight to Finance section)
  const showExcoSection = !isFinanceExecPV;

  return (
    <Document title={`PV ${pv.pv_no}`}>
      <Page size="A4" style={s.page}>

        {/* ── PAID banner at TOP ──────────────────────────────────────── */}
        {isPaid && <View style={{ marginBottom: 8 }}><PaidBanner pv={pv} /></View>}

        {/* Row 1: Logo + Office Use */}
        <View style={[s.row, { marginBottom: 6 }]}>
          <View style={{ flex: 1 }}>
            <View style={s.row}>
              <View style={{ width: 55 }}>
                {logoDataUri ? <Image src={logoDataUri} style={{ width: 50, height: 50 }} /> : null}
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

        {/* Applicant signature — hidden for Finance Executive and EXCO-member PVs */}
        {showApplicantSig && (
          <View style={[s.border, { marginTop: 8, padding: "6pt 8pt" }]}>
            <Text style={[s.bold, s.tiny, { marginBottom: 3 }]}>Applicant{"'"}s Signature 申请者签名:</Text>
            <View style={{ height: 40 }} />
            <View style={[s.borderT, { paddingTop: 3 }]}>
              <Text style={s.tiny}>Name: <Text style={s.bold}>{pv.sig_applicant_name || pv.applicant_name}</Text>    Date: {fmtDate(pv.submitted_at)}</Text>
            </View>
          </View>
        )}

        {/* EXCO / Ministry Head verification — hidden for Finance Executive PVs */}
        {showExcoSection && (
          <View style={[s.border, { marginTop: 6, padding: "6pt 8pt" }]}>
            <Text style={[s.bold, s.tiny, { marginBottom: 1 }]}>Verified by 审核者签名:</Text>
            <Text style={[s.tiny, { color: "#555", marginBottom: 4 }]}>(By EXCO Member / Dept Head in Charge  事工主席/负责人)</Text>
            {excoApproval?.signature_data ? (
              <Image src={excoApproval.signature_data} style={{ height: 40, objectFit: "contain", objectPositionX: "left" }} />
            ) : (
              <View style={{ height: 40 }} />
            )}
            <View style={[s.borderT, { paddingTop: 3 }]}>
              {ministryVerified ? (
                <>
                  <Text style={[s.bold, s.tiny]}>
                    {excoApproval?.name ?? pv.ministry_verified_by ?? pv.dept_head_name ?? "EXCO Member"}
                  </Text>
                  <Text style={s.tiny}>
                    {pv.ministry}{"  "}Date:{" "}
                    {fmtDate(excoApproval?.timestamp ?? pv.ministry_verified_at ?? pv.head_verified_at)}
                  </Text>
                </>
              ) : (
                <Text style={s.tiny}>Name 姓名: _______________________________{"     "}Date 日期: ___________</Text>
              )}
            </View>
          </View>
        )}

        {/* Finance section — with signature images */}
        <View style={{ marginTop: 8 }}>
          <View style={s.finHeader}>
            <Text>FOR LCM FINANCE OFFICE ONLY  LCM财务处专用</Text>
          </View>
          <View style={[s.row, s.border, { borderTop: "none" }]}>
            {/* Finance Executive */}
            <View style={[{ flex: 1, borderRight: "1pt solid #000" }]}>
              <SigBox
                approval={financeApproval ?? (pv.finance_verified_by ? {
                  role: "FINANCE_ADMIN", email: "", name: pv.finance_verified_by,
                  action: "APPROVED", timestamp: pv.finance_verified_at, remarks: "",
                } : undefined)}
                label="Prepared by:"
                subtitle="(Finance Executive)"
              />
            </View>
            {/* General Manager */}
            <View style={[{ flex: 1, borderRight: "1pt solid #000" }]}>
              <SigBox approval={gmApproval} label="Verified by:" subtitle="(General Manager)" />
            </View>
            {/* Signatories */}
            <View style={{ flex: 1 }}>
              <View style={[{ padding: "6pt 8pt" }]}>
                <View style={[s.borderB, { paddingBottom: 2, marginBottom: 4 }]}>
                  <Text style={[s.bold, s.tiny]}>Approved by:</Text>
                  <Text style={s.tiny}>(Bishop / Secretary / Treasurer)</Text>
                </View>
                <View style={s.row}>
                  {Array.from({ length: loa.required }).map((_, i) => {
                    const appr = sigApprovals[i];
                    return (
                      <View key={i} style={{ flex: 1, alignItems: "center", paddingHorizontal: 2 }}>
                        {appr?.signature_data ? (
                          <Image src={appr.signature_data} style={{ height: 40, width: "100%", objectFit: "contain" }} />
                        ) : (
                          <View style={{ height: 40 }} />
                        )}
                        <View style={[s.borderT, { paddingTop: 3, width: "100%", alignItems: "center" }]}>
                          {appr ? (
                            <>
                              <Text style={[s.bold, s.tiny]}>{appr.name || appr.email}</Text>
                              <Text style={s.tiny}>{roleLabel(appr.role)}</Text>
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
        </View>

        {/* Remarks */}
        {approvals.filter(a => a.remarks).length > 0 && (
          <View style={{ marginTop: 6 }}>
            <Text style={[s.bold, s.tiny, { marginBottom: 2 }]}>Remarks:</Text>
            {approvals.filter(a => a.remarks).map((a, i) => (
              <Text key={i} style={s.tiny}>{roleLabel(a.role)} ({a.name}): {a.remarks}</Text>
            ))}
          </View>
        )}

        {/* ── PAID banner at BOTTOM ──────────────────────────────────── */}
        {isPaid && <View style={{ marginTop: 10 }}><PaidBanner pv={pv} /></View>}

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
