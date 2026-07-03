"use client";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PayrollEmployee, PayrollSalary } from "@/lib/types";

function n(v: number) { return v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const B = "#4a6da7"; const S50 = "#fafaf9"; const S100 = "#f5f5f4";
const S200 = "#e7e5e4"; const S500 = "#78716c"; const S700 = "#44403c"; const S800 = "#292524";
const R50 = "#fef2f2"; const R700 = "#b91c1c"; const W = "#ffffff";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 8, padding: "14mm", color: S800, backgroundColor: W },
  hdr: { alignItems: "center", marginBottom: 10, borderBottom: `1.5 solid ${B}`, paddingBottom: 8 },
  org: { fontSize: 7, color: S500, letterSpacing: 1.5, marginBottom: 3 },
  slipTitle: { fontSize: 14, fontFamily: "Helvetica-Bold", color: B, marginBottom: 2 },
  period: { fontSize: 9, color: S700 },
  infoTable: { border: `1 solid ${S200}`, marginBottom: 9 },
  infoRow: { flexDirection: "row", borderBottom: `0.5 solid ${S200}` },
  iL: { width: "18%", backgroundColor: S50, padding: "3 6", color: S500, fontSize: 7 },
  iV: { width: "32%", padding: "3 6", fontFamily: "Helvetica-Bold", color: S800, fontSize: 7 },
  secBar: { backgroundColor: B, color: W, fontSize: 7, fontFamily: "Helvetica-Bold", padding: "3 8", textTransform: "uppercase", letterSpacing: 0.8 },
  secBox: { border: `1 solid ${S200}`, marginBottom: 8 },
  lr: { flexDirection: "row", borderBottom: `0.5 solid ${S200}`, padding: "3 8" },
  lLbl: { flex: 1, fontSize: 8, color: S700 },
  lAmt: { fontSize: 8, textAlign: "right", minWidth: 70 },
  totR: { flexDirection: "row", backgroundColor: S100, borderTop: `0.5 solid ${S200}`, padding: "4 8" },
  totLbl: { flex: 1, fontSize: 8, fontFamily: "Helvetica-Bold", color: S700 },
  totAmt: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "right", minWidth: 70, color: S700 },
  redR: { flexDirection: "row", borderBottom: `0.5 solid ${S200}`, padding: "3 8", backgroundColor: R50 },
  redLbl: { flex: 1, fontSize: 8, color: R700 },
  redAmt: { fontSize: 8, textAlign: "right", minWidth: 70, color: R700 },
  netBox: { backgroundColor: B, padding: "8 12", marginBottom: 8, flexDirection: "row", alignItems: "center" },
  netLbl: { flex: 1, fontSize: 9, color: W, fontFamily: "Helvetica-Bold" },
  netAmt: { fontSize: 15, fontFamily: "Helvetica-Bold", color: W },
  erBox: { border: `0.5 solid ${S200}`, backgroundColor: S50, padding: "6 8", marginBottom: 10 },
  erTitle: { fontSize: 7, fontFamily: "Helvetica-Bold", color: S500, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 3 },
  erRow: { flexDirection: "row", marginBottom: 1.5 },
  erLbl: { flex: 1, fontSize: 7, color: S700 },
  erAmt: { fontSize: 7, textAlign: "right", minWidth: 60 },
  sigRow: { flexDirection: "row", marginTop: 18, gap: 30 },
  sigBox: { flex: 1 },
  sigLine: { borderBottom: `0.75 solid ${S500}`, marginBottom: 4, paddingBottom: 12 },
  sigLbl: { fontSize: 7, color: S700 },
  sigDate: { fontSize: 6.5, color: S500, marginTop: 3 },
  foot: { fontSize: 6.5, color: S500, marginTop: 8, borderTop: `0.5 solid ${S200}`, paddingTop: 5 },
});

export interface PayslipPDFProps {
  emp: PayrollEmployee;
  monthLabel: string;
  year: number;
  salary: PayrollSalary | null;
  gross: number;
  pcbVal: number;
  epfEe: number; epfEr: number;
  socsoEe: number; socsoEr: number;
  eisEe: number; eisEr: number;
  eplDeduction: number;
  net: number;
  customItems: { label: string; type: "allowance" | "deduction"; amount: number }[];
}

export function PayslipPDF({ emp, monthLabel, year, salary, gross, pcbVal, epfEe, epfEr, socsoEe, socsoEr, eisEe, eisEr, eplDeduction, net, customItems }: PayslipPDFProps) {
  const dept = emp.posting_type === "CHURCH"
    ? `${emp.designation} — ${emp.church_name}` : emp.department || emp.designation || "—";

  // Earning components
  const earns: { label: string; amount: number }[] = [];
  if (salary) {
    earns.push({ label: "Basic Salary", amount: Number(salary.base_salary) });
    if (Number(salary.increment_carried) > 0) earns.push({ label: "Increment (accumulated)", amount: Number(salary.increment_carried) });
    if (Number(salary.increment_current) > 0) earns.push({ label: "Current year increment", amount: Number(salary.increment_current) });
    if (Number(salary.experience_bonus) > 0) earns.push({ label: "Experience bonus", amount: Number(salary.experience_bonus) });
    if (Number(salary.family_allowance) > 0) earns.push({ label: "Family allowance", amount: Number(salary.family_allowance) });
    if (Number(salary.stm_allowance) > 0) earns.push({ label: "STM / Allowance", amount: Number(salary.stm_allowance) });
    for (const i of customItems.filter(i => i.type === "allowance")) earns.push({ label: i.label, amount: i.amount });
  } else {
    earns.push({ label: "Gross Salary", amount: gross });
  }

  const customDeds = customItems.filter(i => i.type === "deduction");
  const totalDed = epfEe + socsoEe + eisEe + pcbVal + eplDeduction + customDeds.reduce((s, i) => s + i.amount, 0);

  return (
    <Document title={`Payslip — ${monthLabel} ${year} — ${emp.full_name}`} author="Lutheran Church in Malaysia">
      <Page size="A4" style={s.page}>

        <View style={s.hdr}>
          <Text style={s.org}>LUTHERAN CHURCH IN MALAYSIA</Text>
          <Text style={s.slipTitle}>SALARY SLIP</Text>
          <Text style={s.period}>{monthLabel.toUpperCase()} {year}</Text>
        </View>

        <View style={s.infoTable}>
          <View style={s.infoRow}>
            <Text style={s.iL}>Full Name</Text><Text style={s.iV}>{emp.full_name}</Text>
            <Text style={s.iL}>Employee No.</Text><Text style={s.iV}>{emp.emp_no || "—"}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.iL}>Designation</Text><Text style={s.iV}>{emp.designation}</Text>
            <Text style={s.iL}>IC No.</Text><Text style={s.iV}>{emp.ic_no || "—"}</Text>
          </View>
          <View style={s.infoRow}>
            <Text style={s.iL}>Dept / Church</Text><Text style={s.iV}>{dept}</Text>
            <Text style={s.iL}>EPF No.</Text><Text style={s.iV}>{emp.epf_no || "—"}</Text>
          </View>
          <View style={[s.infoRow, { borderBottomWidth: 0 }]}>
            <Text style={s.iL}>TIN (Tax)</Text><Text style={s.iV}>{emp.tin || "—"}</Text>
            <Text style={s.iL}>Bank</Text><Text style={s.iV}>{emp.bank_name ? `${emp.bank_name} · ${emp.bank_acct}` : "—"}</Text>
          </View>
        </View>

        <Text style={s.secBar}>Earning</Text>
        <View style={s.secBox}>
          {earns.map((c, i) => <View key={i} style={s.lr}><Text style={s.lLbl}>{c.label}</Text><Text style={s.lAmt}>{n(c.amount)}</Text></View>)}
          <View style={s.totR}><Text style={s.totLbl}>GROSS PAY</Text><Text style={s.totAmt}>{n(gross)}</Text></View>
        </View>

        <Text style={s.secBar}>Deduction</Text>
        <View style={s.secBox}>
          <View style={s.lr}><Text style={s.lLbl}>Employee EPF (KWSP)</Text><Text style={s.lAmt}>{n(epfEe)}</Text></View>
          <View style={s.lr}><Text style={s.lLbl}>Employee SOCSO (PERKESO)</Text><Text style={s.lAmt}>{n(socsoEe)}</Text></View>
          <View style={s.lr}><Text style={s.lLbl}>Employee EIS (PERKESO)</Text><Text style={s.lAmt}>{n(eisEe)}</Text></View>
          {pcbVal > 0 && <View style={s.lr}><Text style={s.lLbl}>PCB / Income Tax (MTD)</Text><Text style={s.lAmt}>{n(pcbVal)}</Text></View>}
          {eplDeduction > 0 && <View style={s.redR}><Text style={s.redLbl}>EPL Loan Deduction</Text><Text style={s.redAmt}>{n(eplDeduction)}</Text></View>}
          {customDeds.map((item, i) => <View key={i} style={s.redR}><Text style={s.redLbl}>{item.label}</Text><Text style={s.redAmt}>{n(item.amount)}</Text></View>)}
          <View style={s.totR}><Text style={s.totLbl}>TOTAL DEDUCTION</Text><Text style={s.totAmt}>{n(totalDed)}</Text></View>
        </View>

        <View style={s.netBox}>
          <Text style={s.netLbl}>NET PAY</Text>
          <Text style={s.netAmt}>RM {n(net)}</Text>
        </View>

        <View style={s.erBox}>
          <Text style={s.erTitle}>Employer Contributions (not deducted from your pay)</Text>
          <View style={s.erRow}><Text style={s.erLbl}>EPF Employer (KWSP)</Text><Text style={s.erAmt}>RM {n(epfEr)}</Text></View>
          <View style={s.erRow}><Text style={s.erLbl}>SOCSO Employer (PERKESO)</Text><Text style={s.erAmt}>RM {n(socsoEr)}</Text></View>
          <View style={s.erRow}><Text style={s.erLbl}>EIS Employer (PERKESO)</Text><Text style={s.erAmt}>RM {n(eisEr)}</Text></View>
        </View>

        <View style={s.sigRow}>
          <View style={s.sigBox}>
            <View style={s.sigLine} />
            <Text style={s.sigLbl}>Authorised by / Finance Executive</Text>
            <Text style={s.sigDate}>Date: ___________________</Text>
          </View>
          <View style={s.sigBox}>
            <View style={s.sigLine} />
            <Text style={s.sigLbl}>Received by / {emp.full_name}</Text>
            <Text style={s.sigDate}>Date: ___________________</Text>
          </View>
        </View>

        <Text style={s.foot}>This is a computer-generated document. Contact HR for any payslip queries.</Text>
      </Page>
    </Document>
  );
}
