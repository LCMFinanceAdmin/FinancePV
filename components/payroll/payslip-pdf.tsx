"use client";
import { Document, Font, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PayrollEmployee, PayrollSalary } from "@/lib/types";
import { grossComponentsForMonth } from "@/lib/payroll/calc";

// Noto Sans SC supports Simplified Chinese (马来西亚基督教信义会 etc.)
Font.register({
  family: "NotoSansSC",
  fonts: [
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2" },
    { src: "https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-700-normal.woff2", fontWeight: "bold" },
  ],
});

function n(v: number) { return v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const BLUE = "#1a4fa0";
const BDR = 0.75; // border width

const s = StyleSheet.create({
  page:   { fontFamily: "Helvetica", fontSize: 9, padding: "12mm", backgroundColor: "#fff", color: "#1c1917" },
  center: { textAlign: "center" },

  // ── Header ──────────────────────────────────────────────────────────────────
  orgTitle: { fontSize: 11, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 4 },

  headerRow:  { flexDirection: "row", marginBottom: 0 },
  empTable:   { flex: 1, borderWidth: BDR, borderColor: "#78716c" },
  empRow:     { flexDirection: "row", borderBottomWidth: BDR, borderColor: "#78716c" },
  empRowLast: { flexDirection: "row" },
  // 4-column header: label | main value | statutory label | statutory value
  hC1: { width: 78, padding: "2 4", fontFamily: "Helvetica-Bold", borderRightWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  hC2: { width: 135, padding: "2 4", fontSize: 8, borderRightWidth: BDR, borderColor: "#78716c" },
  hC3: { width: 54, padding: "2 4", fontFamily: "Helvetica-Bold", borderRightWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  hC4: { flex: 1, padding: "2 4", fontSize: 8 },
  hNameVal: { flex: 1, padding: "2 4", fontFamily: "Helvetica-Bold", fontSize: 8 },

  // PAYSLIP box — narrower, 3 items only
  slipBox:   { width: 120, borderWidth: BDR, borderColor: "#78716c", borderLeftWidth: 0 },
  slipTitle: { borderBottomWidth: BDR, borderColor: "#78716c", padding: "3 4", textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 11 },
  slipPer:   { borderBottomWidth: BDR, borderColor: "#78716c", padding: "2 4", textAlign: "center", fontFamily: "Helvetica-Bold", fontSize: 9 },
  slipSub:   { padding: "2 4", textAlign: "center", fontSize: 8 },

  // ── Main earn / deduct table ─────────────────────────────────────────────────
  mainTable: { borderWidth: BDR, borderColor: "#78716c", borderTopWidth: 0, marginBottom: 0 },
  thRow:     { flexDirection: "row", backgroundColor: "#f5f5f4" },
  thLbl:     { flex: 38, padding: "2 4", fontFamily: "Helvetica-Bold", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c" },
  thAmt:     { flex: 12, padding: "2 4", fontFamily: "Helvetica-Bold", textAlign: "right", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c" },
  thLbl2:    { flex: 38, padding: "2 4", fontFamily: "Helvetica-Bold", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c" },
  thAmt2:    { flex: 12, padding: "2 4", fontFamily: "Helvetica-Bold", textAlign: "right", borderBottomWidth: BDR, borderColor: "#78716c" },

  dataRow:  { flexDirection: "row" },
  dEL: { flex: 38, padding: "2 4", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  dEA: { flex: 12, padding: "2 4", textAlign: "right", fontFamily: "Helvetica", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  dDL: { flex: 38, padding: "2 4", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  dDA: { flex: 12, padding: "2 4", textAlign: "right", fontFamily: "Helvetica", borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },

  totRow:  { flexDirection: "row", borderTopWidth: 1.5, borderColor: "#44403c" },
  totEL:  { flex: 38, padding: "3 4", fontFamily: "Helvetica-Bold", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  totEA:  { flex: 12, padding: "3 4", fontFamily: "Helvetica-Bold", textAlign: "right", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  totDL:  { flex: 38, padding: "3 4", fontFamily: "Helvetica-Bold", borderRightWidth: BDR, borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },
  totDA:  { flex: 12, padding: "3 4", fontFamily: "Helvetica-Bold", textAlign: "right", borderBottomWidth: BDR, borderColor: "#78716c", fontSize: 8 },

  pcbRow: { flexDirection: "row" },
  netRow: { flexDirection: "row" },
  // The adjustments note. Deliberately quiet — it explains a figure rather
  // than being one, and must not compete with the pay table above it.
  adjBox: { marginTop: 6, border: "0.5 solid #d6d3d1", backgroundColor: "#fafaf9", padding: "4 6" },
  adjTitle: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: "#78716c", marginBottom: 2 },
  adjLine: { fontSize: 7, color: "#44403c", marginBottom: 1 },

  // ── Bottom 3-panel ───────────────────────────────────────────────────────────
  bottomRow: { flexDirection: "row", borderWidth: BDR, borderColor: "#78716c", borderTopWidth: 0 },

  // Panel 1: current month stats
  p1: { flex: 40, borderRightWidth: BDR, borderColor: "#78716c", padding: "4 4" },
  p1Title: { fontSize: 8, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 3 },
  p1Table: {},
  p1HRow: { flexDirection: "row", marginBottom: 1 },
  p1DRow: { flexDirection: "row", marginBottom: 1 },
  p1Lbl:  { width: 52, fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  p1Col:  { flex: 1, textAlign: "right", fontSize: 7.5, fontFamily: "Helvetica" },
  p1ColH: { flex: 1, textAlign: "center", fontSize: 7.5, fontFamily: "Helvetica-Bold" },
  p1Sep:  { borderTopWidth: 0.5, borderColor: "#78716c", marginVertical: 1 },

  // Panel 2: deductions
  p2: { flex: 18, borderRightWidth: BDR, borderColor: "#78716c", padding: "4 3", alignItems: "center" },
  p2Title: { fontSize: 7.5, fontFamily: "Helvetica-Bold", marginBottom: 3, textAlign: "center" },
  p2Sub:   { fontSize: 7, color: "#78716c", marginBottom: 2 },
  p2Item:  { fontSize: 8, textAlign: "center" },
  p2Amt:   { fontSize: 8, fontFamily: "Helvetica", textAlign: "right", width: "100%" },

  // Panel 3: church stamp + signatures
  p3: { flex: 42, padding: "4 6" },
  p3Blue: { color: BLUE, textAlign: "center" },
  p3Chinese: { color: BLUE, fontSize: 11, fontFamily: "NotoSansSC", fontWeight: "bold", letterSpacing: 1, marginBottom: 2, textAlign: "center" },
  p3Name: { color: BLUE, fontSize: 9, fontFamily: "Helvetica-Bold", letterSpacing: 0.5, marginBottom: 1, textAlign: "center" },
  p3Addr: { color: BLUE, fontSize: 7, textAlign: "center", marginBottom: 1 },
  p3SigArea: { marginTop: 6 },
  p3SigRow: { flexDirection: "row", alignItems: "flex-end", marginBottom: 5 },
  p3SigLbl: { fontSize: 8, fontFamily: "Helvetica-Bold", width: 66 },
  p3SigLine: { flex: 1, borderBottomWidth: 0.75, borderColor: "#555" },
});

/** Category keys as an employee should read them. */
const ADJ_LABEL: Record<string, string> = {
  PCB: "PCB (Income Tax)",
  EPF_EE: "Employee EPF", EPF_ER: "Employer EPF",
  SOCSO_EE: "Employee SOCSO", SOCSO_ER: "Employer SOCSO",
  SKBBK: "SKBBK (Lindung 24)",
  EIS_EE: "Employee EIS", EIS_ER: "Employer EIS",
};

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
  skbbk?: number;
  eplDeduction: number;
  net: number;
  customItems: { label: string; type: "allowance" | "deduction"; amount: number }[];
  /**
   * Corrections carried by this month.
   *
   * The statutory figures above already include theirs — they arrive adjusted
   * from calcLine — so these are NOT added to them again. What is still missing
   * without this is the itemisation: why gross is higher than the salary
   * components add up to, and why SKBBK is three times its usual figure. A
   * payslip whose total is right and whose lines do not explain it is the one
   * that generates the phone call.
   */
  adjustments?: { category: string; amount: number; reason?: string }[];
  /**
   * The month being paid, 1-12 (and is13thMonth for the 13th).
   *
   * Needed only to itemise the earnings correctly: whether the gross carries
   * this year's increment depends on the month, so a list built without it can
   * disagree with the total it sits above.
   */
  month: number;
  is13thMonth?: boolean;
}

export function PayslipPDF({
  emp, monthLabel, year, salary,
  gross, pcbVal, epfEe, epfEr, socsoEe, socsoEr, eisEe, eisEr, skbbk = 0,
  eplDeduction, net, customItems, adjustments = [], month, is13thMonth = false,
}: PayslipPDFProps) {
  const dept = emp.posting_type === "CHURCH"
    ? `${(emp.designation || "PASTOR").toUpperCase()} - ${(emp.church_name || "").toUpperCase()}`
    : (emp.department || emp.designation || "—").toUpperCase();

  // Earning components
  const earns: { label: string; amount: number }[] = [];
  if (salary) {
    // From calc.ts, so the items listed are exactly the ones inside the gross
    // printed below them — including whether this month's gross carries the
    // current year's increment yet.
    earns.push(...grossComponentsForMonth(salary, emp.date_commenced, month, is13thMonth, emp.increment_month_override));
    for (const i of customItems.filter(i => i.type === "allowance")) earns.push({ label: i.label, amount: i.amount });
    // Gross corrections belong on the earnings side, or the items listed there
    // stop adding up to the GROSS PAY figure printed below them.
    for (const a of adjustments.filter(a => a.category === "GROSS")) {
      earns.push({ label: a.reason || "Adjustment", amount: Number(a.amount) });
    }
  } else {
    earns.push({ label: "Basic Salary", amount: gross });
  }

  const netAdjustments = adjustments.filter(a => a.category === "NET");
  // Corrections that moved a statutory figure rather than pay. They are already
  // inside the numbers, so they are listed as a note rather than a line.
  const statAdjustments = adjustments.filter(a => a.category !== "NET" && a.category !== "GROSS");

  // Deduction items
  const deds: { label: string; amount: number }[] = [
    { label: "Employee EPF", amount: epfEe },
    { label: "Employee SOCSO", amount: socsoEe },
    // Non-zero, not positive: totalDeductions below adds these whatever their
    // sign, so a refund hidden by a positive test would move the total with
    // nothing on the payslip to account for it.
    ...(skbbk !== 0 ? [{ label: "SKBBK (Lindung 24)", amount: skbbk }] : []),
    { label: "Employee EIS", amount: eisEe },
    ...(pcbVal !== 0 ? [{ label: "PCB (Income Tax)", amount: pcbVal }] : []),
    ...(eplDeduction > 0 ? [{ label: "Deduction (EPL)", amount: eplDeduction }] : []),
    ...customItems.filter(i => i.type === "deduction").map(i => ({ label: i.label, amount: i.amount })),
    // A net-only correction belongs to no scheme, so it has no figure of its
    // own to sit inside. It goes here with its sign flipped — paying somebody
    // an extra 100 is a deduction of −100 — which keeps the one piece of
    // arithmetic a reader actually checks true: gross − deductions = net.
    ...netAdjustments.map(a => ({ label: a.reason || "Adjustment", amount: -Number(a.amount) })),
  ];

  const totalDeductions = epfEe + socsoEe + skbbk + eisEe + pcbVal + eplDeduction +
    customItems.filter(i => i.type === "deduction").reduce((s, i) => s + i.amount, 0)
    - netAdjustments.reduce((s, a) => s + Number(a.amount), 0);

  const maxRows = Math.max(earns.length, deds.length);
  const rows = Array.from({ length: maxRows }, (_, i) => ({ e: earns[i], d: deds[i] }));

  return (
    <Document title={`Payslip — ${monthLabel} ${year} — ${emp.full_name}`} author="Lutheran Church in Malaysia">
      <Page size="A4" style={s.page}>

        {/* Title */}
        <Text style={s.orgTitle}>LUTHERAN CHURCH IN MALAYSIA</Text>

        {/* Header: 4-col employee table | narrow PAYSLIP box */}
        <View style={s.headerRow}>
          <View style={s.empTable}>
            {/* Row 1: Name (value spans full width) */}
            <View style={s.empRow}>
              <Text style={s.hC1}>Name</Text>
              <Text style={s.hNameVal}>: {emp.full_name.toUpperCase()}</Text>
            </View>
            {/* Row 2: NRIC | SOCSO */}
            <View style={s.empRow}>
              <Text style={s.hC1}>NRIC</Text>
              <Text style={s.hC2}>: {emp.ic_no || "—"}</Text>
              <Text style={s.hC3}>SOCSO :</Text>
              <Text style={s.hC4}>{emp.ic_no || "—"}</Text>
            </View>
            {/* Row 3: DEPT | EPF */}
            <View style={s.empRow}>
              <Text style={s.hC1}>DEPT</Text>
              <Text style={s.hC2}>: {dept}</Text>
              <Text style={s.hC3}>EPF :</Text>
              <Text style={s.hC4}>{emp.epf_no || "—"}</Text>
            </View>
            {/* Row 4: EMPLOYEE NO | TAX */}
            <View style={s.empRowLast}>
              <Text style={s.hC1}>EMPLOYEE NO</Text>
              <Text style={s.hC2}>: {emp.emp_no}</Text>
              <Text style={s.hC3}>TAX :</Text>
              <Text style={s.hC4}>{emp.tin || "—"}</Text>
            </View>
          </View>
          {/* PAYSLIP box — 3 rows only */}
          <View style={s.slipBox}>
            <Text style={s.slipTitle}>PAYSLIP</Text>
            <Text style={s.slipPer}>{monthLabel.toUpperCase()} {year}</Text>
            <Text style={s.slipSub}>Monthly</Text>
          </View>
        </View>

        {/* Main 4-column earning / deduction table */}
        <View style={s.mainTable}>
          {/* Header */}
          <View style={s.thRow}>
            <Text style={s.thLbl}>EARNING</Text>
            <Text style={s.thAmt}>RM</Text>
            <Text style={s.thLbl2}>DEDUCTION</Text>
            <Text style={s.thAmt2}>RM</Text>
          </View>

          {/* Data rows */}
          {rows.map((row, i) => (
            <View key={i} style={s.dataRow}>
              <Text style={s.dEL}>{row.e?.label ?? ""}</Text>
              <Text style={s.dEA}>{row.e ? n(row.e.amount) : ""}</Text>
              <Text style={s.dDL}>{row.d?.label ?? ""}</Text>
              <Text style={s.dDA}>{row.d ? n(row.d.amount) : ""}</Text>
            </View>
          ))}

          {/* Spacer */}
          <View style={[s.dataRow, { minHeight: 14 }]}>
            <Text style={s.dEL}> </Text><Text style={s.dEA}> </Text>
            <Text style={s.dDL}> </Text><Text style={s.dDA}> </Text>
          </View>

          {/* GROSS PAY / TOTAL DEDUCTION */}
          <View style={s.totRow}>
            <Text style={s.totEL}>GROSS PAY</Text>
            <Text style={s.totEA}>{n(gross)}</Text>
            <Text style={s.totDL}>TOTAL DEDUCTION</Text>
            <Text style={s.totDA}>{n(totalDeductions)}</Text>
          </View>

          {/* PCB note row */}
          <View style={s.pcbRow}>
            <Text style={[s.dEL, { color: "#78716c", fontSize: 7.5, borderBottomWidth: BDR }]}>PCB: Monthly: {n(pcbVal)}</Text>
            <Text style={[s.dEA, { borderBottomWidth: BDR }]}> </Text>
            <Text style={[s.dDL, { borderBottomWidth: BDR }]}> </Text>
            <Text style={[s.dDA, { borderBottomWidth: BDR }]}> </Text>
          </View>

          {/* Net Pay */}
          <View style={s.netRow}>
            <Text style={[s.dEL, { borderBottomWidth: 0 }]}> </Text>
            <Text style={[s.dEA, { borderBottomWidth: 0 }]}> </Text>
            <Text style={[s.dDL, { fontFamily: "Helvetica-Bold", textAlign: "right", borderBottomWidth: 0 }]}>Net Pay</Text>
            <Text style={[s.dDA, { fontFamily: "Helvetica-Bold", fontSize: 10, borderBottomWidth: 0 }]}>{n(net)}</Text>
          </View>
        </View>

        {/* Why a statutory figure is not its usual amount.
            These corrections are already inside the deductions above, so this
            adds nothing to the arithmetic — it answers the question the
            arithmetic provokes. Without it the only honest reading of an
            unexpected SKBBK figure is that the payslip is wrong. */}
        {statAdjustments.length > 0 && (
          <View style={s.adjBox}>
            <Text style={s.adjTitle}>ADJUSTMENTS THIS MONTH</Text>
            {statAdjustments.map((a, i) => (
              <Text key={i} style={s.adjLine}>
                {`• ${ADJ_LABEL[a.category] ?? a.category}: ${Number(a.amount) > 0 ? "+" : "−"}${n(Math.abs(Number(a.amount)))}`}
                {a.reason ? ` — ${a.reason}` : ""}
              </Text>
            ))}
          </View>
        )}

        {/* Bottom 3-panel row */}
        <View style={s.bottomRow}>

          {/* Panel 1: Current month EE / ER / Total */}
          <View style={s.p1}>
            <Text style={s.p1Title}>&lt;———— CURRENT MONTH ————&gt;</Text>
            <View style={s.p1HRow}>
              <Text style={s.p1Lbl}> </Text>
              <Text style={s.p1ColH}>E.P.F</Text>
              <Text style={s.p1ColH}>SOCSO</Text>
              {skbbk !== 0 && <Text style={s.p1ColH}>SKBBK</Text>}
              <Text style={s.p1ColH}>E.I.S</Text>
              <Text style={s.p1ColH}>Tax</Text>
            </View>
            <View style={s.p1DRow}>
              <Text style={s.p1Lbl}>EMPLOYEE :</Text>
              <Text style={s.p1Col}>{n(epfEe)}</Text>
              <Text style={s.p1Col}>{n(socsoEe)}</Text>
              {skbbk !== 0 && <Text style={s.p1Col}>{n(skbbk)}</Text>}
              <Text style={s.p1Col}>{n(eisEe)}</Text>
              <Text style={s.p1Col}>{n(pcbVal)}</Text>
            </View>
            <View style={s.p1DRow}>
              <Text style={s.p1Lbl}>EMPLOYER :</Text>
              <Text style={s.p1Col}>{n(epfEr)}</Text>
              <Text style={s.p1Col}>{n(socsoEr)}</Text>
              {skbbk !== 0 && <Text style={s.p1Col}> </Text>}
              <Text style={s.p1Col}>{n(eisEr)}</Text>
              <Text style={s.p1Col}> </Text>
            </View>
            <View style={s.p1Sep} />
            <View style={s.p1DRow}>
              <Text style={s.p1Lbl}>TOTAL :</Text>
              <Text style={s.p1Col}>{n(epfEe + epfEr)}</Text>
              <Text style={s.p1Col}>{n(socsoEe + socsoEr)}</Text>
              {skbbk !== 0 && <Text style={s.p1Col}>{n(skbbk)}</Text>}
              <Text style={s.p1Col}>{n(eisEe + eisEr)}</Text>
              <Text style={s.p1Col}> </Text>
            </View>
          </View>

          {/* Panel 2: EPL deduction */}
          <View style={s.p2}>
            <Text style={s.p2Title}>—DEDUCTION—</Text>
            <Text style={s.p2Sub}>-Amt-</Text>
            {eplDeduction > 0 ? (
              <>
                <Text style={s.p2Item}>EPL</Text>
                <Text style={s.p2Amt}>{n(eplDeduction)}</Text>
              </>
            ) : (
              <Text style={[s.p2Item, { color: "#d6d3d1" }]}>—</Text>
            )}
          </View>

          {/* Panel 3: Church stamp + signatures */}
          <View style={s.p3}>
            <Text style={s.p3Chinese}>马来西亚基督教信义会</Text>
            <Text style={s.p3Name}>LUTHERAN CHURCH IN MALAYSIA</Text>
            <Text style={s.p3Addr}>Level 6, Luther Centre, No. 6, Jalan Utara,</Text>
            <Text style={s.p3Addr}>46200 Petaling Jaya, Selangor.</Text>
            <Text style={s.p3Addr}>Tel: 03-79565992 / 03-79560014</Text>
            <Text style={s.p3Addr}>Fax: 03-79576953  Email: hq@lcm.org.my</Text>
            <View style={s.p3SigArea}>
              <View style={s.p3SigRow}>
                <Text style={s.p3SigLbl}>APPROVED BY</Text>
                <View style={s.p3SigLine} />
              </View>
              <View style={s.p3SigRow}>
                <Text style={s.p3SigLbl}>RECEIVED BY</Text>
                <View style={s.p3SigLine} />
              </View>
            </View>
          </View>

        </View>

      </Page>
    </Document>
  );
}
