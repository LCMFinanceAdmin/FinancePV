"use client";
import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { PayrollEmployee, PayrollSalary, PayrollEmployeeCustomItem } from "@/lib/types";
import type { CalcLine } from "@/lib/payroll/calc";

const ML = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

function n(v: number) { return v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return `${String(d.getDate()).padStart(2,"0")} ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getFullYear()}`;
}
function ageFrom(dob: string | null): string {
  if (!dob) return "";
  const d = new Date(dob); const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return String(age);
}
function yrsService(c: string | null): string {
  if (!c) return "";
  const d = new Date(c); const now = new Date();
  let y = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) y--;
  return `${y} year${y !== 1 ? "s" : ""}`;
}

const B = "#4a6da7";   // brand blue
const DB = "#3d5c8f";  // dark blue border
const S50 = "#fafaf9"; const S100 = "#f5f5f4"; const S200 = "#e7e5e4";
const S500 = "#78716c"; const S700 = "#44403c"; const S800 = "#292524";
const A50 = "#fffbeb"; const A300 = "#fcd34d"; const A700 = "#b45309";
const G50 = "#f0fdf4"; const G700 = "#15803d"; const G800 = "#166534";
const R50 = "#fef2f2"; const R700 = "#b91c1c"; const R800 = "#991b1b";
const W = "#ffffff";

const s = StyleSheet.create({
  page: { fontFamily: "Helvetica", fontSize: 7, padding: 22, color: S800, backgroundColor: W },
  hdr: { alignItems: "center", marginBottom: 9 },
  org: { fontSize: 6.5, color: S500, marginBottom: 2, letterSpacing: 1.5 },
  title: { fontSize: 13, fontFamily: "Helvetica-Bold", color: S800, marginBottom: 2 },
  sub: { fontSize: 7.5, color: S500 },
  secBar: { backgroundColor: B, color: W, fontSize: 6.5, fontFamily: "Helvetica-Bold", padding: "3 6", textTransform: "uppercase", letterSpacing: 0.8 },
  pRow: { flexDirection: "row", borderBottom: `0.5 solid ${S200}` },
  pLbl: { width: "18%", backgroundColor: S50, padding: "3 6", color: S500, fontSize: 6.5 },
  pVal: { width: "32%", padding: "3 6", fontFamily: "Helvetica-Bold", color: S800, fontSize: 6.5 },
  pTable: { border: `1 solid ${S200}`, marginBottom: 7 },
  spBox: { border: `1 solid ${A300}`, backgroundColor: A50, padding: "5 8", marginBottom: 7 },
  spTitle: { fontSize: 6.5, fontFamily: "Helvetica-Bold", color: A700, marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.8 },
  spRow: { flexDirection: "row", flexWrap: "wrap" },
  spItem: { border: `0.5 solid ${A300}`, backgroundColor: W, padding: "3 5", marginRight: 5, marginBottom: 3 },
  spLbl: { fontSize: 6, color: A700, fontFamily: "Helvetica-Bold", textTransform: "uppercase" },
  spAmt: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: S800, marginTop: 1 },
  spSub: { fontSize: 5.5, color: S500, marginTop: 1 },
  spItemR: { border: `0.5 solid #fca5a5`, backgroundColor: W },
  spItemG: { border: `0.5 solid #86efac`, backgroundColor: W },
  spLblR: { color: R700 }, spAmtR: { color: R700 },
  spLblG: { color: G700 }, spAmtG: { color: G700 },
  tbl: { border: `1 solid ${S200}` },
  thr: { flexDirection: "row" },
  tr: { flexDirection: "row", borderBottom: `0.5 solid ${S200}` },
  trAlt: { flexDirection: "row", borderBottom: `0.5 solid ${S200}`, backgroundColor: S50 },
  trSub: { flexDirection: "row", borderBottom: `0.5 solid ${S200}`, backgroundColor: S100 },
  trAnn: { flexDirection: "row", backgroundColor: B },
  th: { backgroundColor: B, color: W, fontSize: 6, fontFamily: "Helvetica-Bold", padding: "3 2", textAlign: "right", borderRight: `0.5 solid ${DB}` },
  // The scheme each pair of columns belongs to, above them.
  thGrp: { backgroundColor: B, color: W, fontSize: 6, fontFamily: "Helvetica-Bold", padding: "2 2", textAlign: "center", borderRight: `0.5 solid ${DB}`, borderBottom: `0.5 solid ${DB}` },
  thGrpBlank: { backgroundColor: B, padding: "2 2", borderRight: `0.5 solid ${DB}`, borderBottom: `0.5 solid ${DB}` },
  thSk: { backgroundColor: DB, color: W, fontSize: 6, fontFamily: "Helvetica-Bold", padding: "3 2", textAlign: "right", borderRight: `0.5 solid ${DB}` },
  thL: { backgroundColor: B, color: W, fontSize: 6, fontFamily: "Helvetica-Bold", padding: "3 3", textAlign: "left", borderRight: `0.5 solid ${DB}` },
  thR: { backgroundColor: R800, color: W, fontSize: 6, fontFamily: "Helvetica-Bold", padding: "3 2", textAlign: "right", borderRight: `0.5 solid ${DB}` },
  thG: { backgroundColor: G800, color: W, fontSize: 6, fontFamily: "Helvetica-Bold", padding: "3 2", textAlign: "right", borderRight: `0.5 solid ${DB}` },
  td: { fontSize: 6, padding: "2.5 2", textAlign: "right", borderRight: `0.5 solid ${S200}` },
  tdL: { fontSize: 6, padding: "2.5 3", textAlign: "left", fontFamily: "Helvetica-Bold", color: S700, borderRight: `0.5 solid ${S200}` },
  tdB: { fontSize: 6, padding: "2.5 2", textAlign: "right", fontFamily: "Helvetica-Bold", borderRight: `0.5 solid ${S200}` },
  tdBl: { fontSize: 6, padding: "2.5 2", textAlign: "right", fontFamily: "Helvetica-Bold", color: B, borderRight: `0.5 solid ${S200}` },
  tdDim: { fontSize: 6, padding: "2.5 2", textAlign: "right", color: S200, borderRight: `0.5 solid ${S200}` },
  tdEpl: { fontSize: 6, padding: "2.5 2", textAlign: "right", backgroundColor: R50, color: R700, fontFamily: "Helvetica-Bold", borderRight: `0.5 solid ${S200}` },
  tdG: { fontSize: 6, padding: "2.5 2", textAlign: "right", backgroundColor: G50, color: G700, fontFamily: "Helvetica-Bold", borderRight: `0.5 solid ${S200}` },
  tdRed: { fontSize: 6, padding: "2.5 2", textAlign: "right", backgroundColor: R50, color: R700, fontFamily: "Helvetica-Bold", borderRight: `0.5 solid ${S200}` },
  tdSub: { fontSize: 6, padding: "2.5 2", textAlign: "right", fontFamily: "Helvetica-Bold", color: S700, borderRight: `0.5 solid ${S200}` },
  tdSubL: { fontSize: 6, padding: "2.5 3", textAlign: "left", fontFamily: "Helvetica-Bold", color: S700, borderRight: `0.5 solid ${S200}` },
  tdSubEpl: { fontSize: 6, padding: "2.5 2", textAlign: "right", fontFamily: "Helvetica-Bold", backgroundColor: R50, color: R700, borderRight: `0.5 solid ${S200}` },
  tdSubG: { fontSize: 6, padding: "2.5 2", textAlign: "right", fontFamily: "Helvetica-Bold", backgroundColor: G50, color: G700, borderRight: `0.5 solid ${S200}` },
  tdSubR: { fontSize: 6, padding: "2.5 2", textAlign: "right", fontFamily: "Helvetica-Bold", backgroundColor: R50, color: R700, borderRight: `0.5 solid ${S200}` },
  tdAnn: { fontSize: 6, padding: "3 2", textAlign: "right", fontFamily: "Helvetica-Bold", color: W, borderRight: `0.5 solid ${DB}` },
  tdAnnL: { fontSize: 6, padding: "3 3", textAlign: "left", fontFamily: "Helvetica-Bold", color: W, borderRight: `0.5 solid ${DB}` },
  tdAnnEpl: { fontSize: 6, padding: "3 2", textAlign: "right", fontFamily: "Helvetica-Bold", color: W, backgroundColor: R800, borderRight: `0.5 solid ${DB}` },
  tdAnnG: { fontSize: 6, padding: "3 2", textAlign: "right", fontFamily: "Helvetica-Bold", color: W, backgroundColor: G800, borderRight: `0.5 solid ${DB}` },
  tdAnnRed: { fontSize: 6, padding: "3 2", textAlign: "right", fontFamily: "Helvetica-Bold", color: W, backgroundColor: R800, borderRight: `0.5 solid ${DB}` },
  notes: { marginTop: 7, fontSize: 5.5, color: S500 },
  nl: { marginBottom: 1.5 },
  sigRow: { flexDirection: "row", marginTop: 22, gap: 30 },
  sigBox: { flex: 1 },
  sigLine: { borderBottom: `0.75 solid ${S500}`, marginBottom: 4, paddingBottom: 10 },
  sigLbl: { fontSize: 6.5, color: S700 },
  sigDate: { fontSize: 6, color: S500, marginTop: 3 },
});

// Fixed column widths (pt). A4 landscape usable ≈ 796pt; these sum to 590 leaving ~206pt for custom cols.
// A heavier rule where one scheme ends and the next begins. SKBBK is not a
// boundary: it keeps its own column and tint, but it is filed on the same
// PERKESO schedule as SOCSO, so a rule either side would cut it off from what
// it belongs to.
const catL = { borderLeft: "1.5 solid #a8a29e" };

const C = { mo:44, gr:54, pcb:42, ee:46, er:46, se:38, sr:38, sk:36, ie:34, ir:34, epl:42, net:58, lcm:58, cu:46 };

export interface YearlySheetPDFProps {
  emp: PayrollEmployee;
  year: number;
  salary: PayrollSalary;
  monthLines: CalcLine[];
  thirteenth: CalcLine | null;
  pcbArr: number[];
  customItemsByMonth: Record<number, PayrollEmployeeCustomItem[]>;
  effMonth: number;
}

export function YearlySheetPDF({ emp, year, salary, monthLines, thirteenth, pcbArr, customItemsByMonth, effMonth }: YearlySheetPDFProps) {
  const customCols: { label: string; type: "allowance" | "deduction" }[] = [];
  const seen = new Set<string>();
  for (let m = 1; m <= 13; m++) for (const ci of customItemsByMonth[m] ?? []) {
    const k = `${ci.label}|${ci.type}`;
    if (!seen.has(k)) { seen.add(k); customCols.push({ label: ci.label, type: ci.type }); }
  }
  const cAmt = (mo: number, col: { label: string }) => Number((customItemsByMonth[mo] ?? []).find(i => i.label === col.label)?.amount ?? 0);
  const cTotal = (col: { label: string }) => Array.from({length:13},(_,i)=>i+1).reduce((s,m)=>s+cAmt(m,col),0);
  const cSub = (col: { label: string }) => Array.from({length:12},(_,i)=>i+1).reduce((s,m)=>s+cAmt(m,col),0);
  const allL = thirteenth ? [...monthLines, thirteenth] : monthLines;
  const sum = (fn: (l: CalcLine) => number) => allL.reduce((s,l)=>s+fn(l),0);

  const hasF = Number(salary.family_allowance)>0;
  const hasS = Number(salary.stm_allowance)>0;
  const hasE = Number(salary.experience_bonus)>0;
  const eplAnn = sum(l=>l.eplDeduction); const hasEpl = eplAnn>0;
  const hasAny = hasF||hasS||hasE||hasEpl||customCols.length>0;
  const posting = emp.posting_type==="CHURCH"?emp.church_name:emp.posting_type==="OFFICE"?"Head Office":emp.department||"—";

  const noRight = { borderRight: 0 } as const;

  return (
    <Document title={`${emp.full_name} — Salary Sheet ${year}`} author="Lutheran Church in Malaysia">
      <Page size="A4" orientation="landscape" style={s.page}>

        {/* Header */}
        <View style={s.hdr}>
          <Text style={s.org}>LUTHERAN CHURCH IN MALAYSIA</Text>
          <Text style={s.title}>Employee Salary Statement</Text>
          <Text style={s.sub}>Year {year}</Text>
        </View>

        {/* Employee profile */}
        <Text style={s.secBar}>Employee Profile</Text>
        <View style={s.pTable}>
          <View style={s.pRow}>
            <Text style={s.pLbl}>Full Name</Text><Text style={s.pVal}>{emp.full_name}</Text>
            <Text style={s.pLbl}>Employee No.</Text><Text style={s.pVal}>{emp.emp_no||"—"}</Text>
          </View>
          <View style={s.pRow}>
            <Text style={s.pLbl}>Designation</Text><Text style={s.pVal}>{emp.designation}</Text>
            <Text style={s.pLbl}>IC No.</Text><Text style={s.pVal}>{emp.ic_no||"—"}</Text>
          </View>
          <View style={s.pRow}>
            <Text style={s.pLbl}>Posting</Text><Text style={s.pVal}>{posting}</Text>
            <Text style={s.pLbl}>Date of Birth</Text><Text style={s.pVal}>{fmtDate(emp.dob)}{emp.dob?` (age ${ageFrom(emp.dob)})`:""}</Text>
          </View>
          <View style={[s.pRow, { borderBottomWidth: 0 }]}>
            <Text style={s.pLbl}>Date Commenced</Text><Text style={s.pVal}>{fmtDate(emp.date_commenced)}{emp.date_commenced?` · ${yrsService(emp.date_commenced)} service`:""}</Text>
            <Text style={s.pLbl}>Marital Status</Text><Text style={s.pVal}>{emp.marital_status||"—"}{emp.spouse_working?" · Spouse working":""}</Text>
          </View>
        </View>

        {/* Special items */}
        {hasAny && (
          <View style={s.spBox}>
            <Text style={s.spTitle}>Special / Non-Statutory Items</Text>
            <View style={s.spRow}>
              {hasF && <View style={s.spItem}><Text style={s.spLbl}>Family Allowance</Text><Text style={s.spAmt}>RM {n(Number(salary.family_allowance))} /month</Text><Text style={s.spSub}>Annual: RM {n(Number(salary.family_allowance)*12)}</Text></View>}
              {hasS && <View style={s.spItem}><Text style={s.spLbl}>STM Allowance</Text><Text style={s.spAmt}>RM {n(Number(salary.stm_allowance))} /month</Text><Text style={s.spSub}>Annual: RM {n(Number(salary.stm_allowance)*12)}</Text></View>}
              {hasE && <View style={s.spItem}><Text style={s.spLbl}>Experience Bonus</Text><Text style={s.spAmt}>RM {n(Number(salary.experience_bonus))} /month</Text><Text style={s.spSub}>Annual: RM {n(Number(salary.experience_bonus)*12)}</Text></View>}
              {hasEpl && <View style={[s.spItem, s.spItemR]}><Text style={[s.spLbl, s.spLblR]}>EPL Deduction</Text><Text style={[s.spAmt, s.spAmtR]}>RM {n(eplAnn)} annual</Text><Text style={s.spSub}>Loan repayment</Text></View>}
              {customCols.map(col => { const t=cTotal(col); if(!t) return null; const a=col.type==="allowance";
                return <View key={col.label} style={[s.spItem, a?s.spItemG:s.spItemR]}><Text style={[s.spLbl, a?s.spLblG:s.spLblR]}>{col.label.toUpperCase()} ({a?"allowance":"deduction"})</Text><Text style={[s.spAmt, a?s.spAmtG:s.spAmtR]}>{a?"+":"−"}RM {n(t)} annual</Text></View>;
              })}
            </View>
          </View>
        )}

        {/* Table */}
        <View style={s.tbl}>
          {/* Scheme grouping above the columns. Widths are summed from the same
              C map the columns use, so the bands stay aligned if a width is
              ever retuned. The trailing blank covers EPL, any custom columns
              and the two totals — none of which belong to a scheme. */}
          <View style={s.thr}>
            <Text style={[s.thGrpBlank,{width:C.mo+C.gr+C.pcb}]}> </Text>
            <Text style={[s.thGrp,{width:C.ee+C.er}]}>EPF</Text>
            <Text style={[s.thGrp,{width:C.se+C.sk+C.sr}]}>SOCSO</Text>
            <Text style={[s.thGrp,{width:C.ie+C.ir}]}>EIS</Text>
            <Text style={[s.thGrpBlank,{width:(hasEpl?C.epl:0)+customCols.length*C.cu+C.net+C.lcm,...noRight}]}> </Text>
          </View>

          {/* Header */}
          <View style={s.thr}>
            <Text style={[s.thL,{width:C.mo}]}>Month</Text>
            <Text style={[s.th,{width:C.gr,...catL}]}>Gross</Text>
            <Text style={[s.th,{width:C.pcb,...catL}]}>PCB</Text>
            <Text style={[s.th,{width:C.ee,...catL}]}>EPF EE</Text>
            <Text style={[s.th,{width:C.er}]}>EPF ER</Text>
            <Text style={[s.th,{width:C.se,...catL}]}>SOCSO EE</Text>
            <Text style={[s.thSk,{width:C.sk}]}>SKBBK</Text>
            <Text style={[s.th,{width:C.sr}]}>SOCSO ER</Text>
            <Text style={[s.th,{width:C.ie,...catL}]}>EIS EE</Text>
            <Text style={[s.th,{width:C.ir}]}>EIS ER</Text>
            {hasEpl && <Text style={[s.thR,{width:C.epl,...catL}]}>EPL</Text>}
            {customCols.map(col=><Text key={col.label} style={[col.type==="allowance"?s.thG:s.thR,{width:C.cu,...(col===customCols[0]?catL:{})}]}>{col.label}</Text>)}
            <Text style={[s.th,{width:C.net,...catL}]}>Net</Text>
            <Text style={[s.th,{width:C.lcm,...catL,...noRight}]}>Total LCM</Text>
          </View>

          {/* Monthly rows */}
          {monthLines.map((l,i)=>{
            const mo=i+1; const row=i%2===0?s.tr:s.trAlt;
            return (
              <View key={i} style={row}>
                <Text style={[s.tdL,{width:C.mo}]}>{ML[i]}</Text>
                <Text style={[s.td,{width:C.gr,...catL}]}>{n(l.gross)}</Text>
                <Text style={[s.td,{width:C.pcb,...catL}]}>{n(pcbArr[i]||0)}</Text>
                <Text style={[s.td,{width:C.ee,...catL}]}>{n(l.epf.ee)}</Text>
                <Text style={[s.td,{width:C.er}]}>{n(l.epf.er)}</Text>
                <Text style={[s.td,{width:C.se,...catL}]}>{n(l.socso.ee)}</Text>
                <Text style={[s.td,{width:C.sk}]}>{n(l.skbbk)}</Text>
                <Text style={[s.td,{width:C.sr}]}>{n(l.socso.er)}</Text>
                <Text style={[s.td,{width:C.ie,...catL}]}>{n(l.eis.ee)}</Text>
                <Text style={[s.td,{width:C.ir}]}>{n(l.eis.er)}</Text>
                {hasEpl && <Text style={[s.tdEpl,{width:C.epl,...catL}]}>{l.eplDeduction>0?n(l.eplDeduction):"—"}</Text>}
                {customCols.map(col=>{ const a=cAmt(mo,col); return <Text key={col.label} style={[col.type==="allowance"?s.tdG:s.tdRed,{width:C.cu,...(col===customCols[0]?catL:{})}]}>{a!==0?(col.type==="allowance"?"+":"−")+n(a):"—"}</Text>; })}
                <Text style={[s.tdB,{width:C.net,...catL}]}>{n(l.net)}</Text>
                <Text style={[s.tdBl,{width:C.lcm,...catL,...noRight}]}>{n(l.totalLcmPayment)}</Text>
              </View>
            );
          })}

          {/* Sub-total */}
          <View style={s.trSub}>
            <Text style={[s.tdSubL,{width:C.mo}]}>SUB-T (12)</Text>
            <Text style={[s.tdSub,{width:C.gr,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.gross,0))}</Text>
            <Text style={[s.tdSub,{width:C.pcb,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.pcb,0))}</Text>
            <Text style={[s.tdSub,{width:C.ee,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.epf.ee,0))}</Text>
            <Text style={[s.tdSub,{width:C.er}]}>{n(monthLines.reduce((s,l)=>s+l.epf.er,0))}</Text>
            <Text style={[s.tdSub,{width:C.se,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.socso.ee,0))}</Text>
            <Text style={[s.tdSub,{width:C.sk}]}>{n(monthLines.reduce((s,l)=>s+l.skbbk,0))}</Text>
            <Text style={[s.tdSub,{width:C.sr}]}>{n(monthLines.reduce((s,l)=>s+l.socso.er,0))}</Text>
            <Text style={[s.tdSub,{width:C.ie,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.eis.ee,0))}</Text>
            <Text style={[s.tdSub,{width:C.ir}]}>{n(monthLines.reduce((s,l)=>s+l.eis.er,0))}</Text>
            {hasEpl && <Text style={[s.tdSubEpl,{width:C.epl,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.eplDeduction,0))}</Text>}
            {customCols.map(col=>{ const t=cSub(col); return <Text key={col.label} style={[col.type==="allowance"?s.tdSubG:s.tdSubR,{width:C.cu,...(col===customCols[0]?catL:{})}]}>{t!==0?(col.type==="allowance"?"+":"−")+n(t):"—"}</Text>; })}
            <Text style={[s.tdSub,{width:C.net,...catL}]}>{n(monthLines.reduce((s,l)=>s+l.net,0))}</Text>
            <Text style={[s.tdSub,{width:C.lcm,...catL,...noRight}]}>{n(monthLines.reduce((s,l)=>s+l.totalLcmPayment,0))}</Text>
          </View>

          {/* 13th month */}
          {thirteenth ? (
            <View style={monthLines.length%2===0?s.tr:s.trAlt}>
              <Text style={[s.tdL,{width:C.mo}]}>13th MTH</Text>
              <Text style={[s.td,{width:C.gr,...catL}]}>{n(thirteenth.gross)}</Text>
              <Text style={[s.td,{width:C.pcb,...catL}]}>{n(pcbArr[12]||0)}</Text>
              <Text style={[s.td,{width:C.ee,...catL}]}>{n(thirteenth.epf.ee)}</Text>
              <Text style={[s.td,{width:C.er}]}>{n(thirteenth.epf.er)}</Text>
              <Text style={[s.tdDim,{width:C.se,...catL}]}>{n(thirteenth.socso.ee)}</Text>
              <Text style={[s.tdDim,{width:C.sk}]}>{n(thirteenth.skbbk)}</Text>
              <Text style={[s.tdDim,{width:C.sr}]}>{n(thirteenth.socso.er)}</Text>
              <Text style={[s.tdDim,{width:C.ie,...catL}]}>{n(thirteenth.eis.ee)}</Text>
              <Text style={[s.tdDim,{width:C.ir}]}>{n(thirteenth.eis.er)}</Text>
              {hasEpl && <Text style={[s.tdEpl,{width:C.epl,...catL}]}>{thirteenth.eplDeduction>0?n(thirteenth.eplDeduction):"—"}</Text>}
              {customCols.map(col=>{ const a=cAmt(13,col); return <Text key={col.label} style={[col.type==="allowance"?s.tdG:s.tdRed,{width:C.cu,...(col===customCols[0]?catL:{})}]}>{a!==0?(col.type==="allowance"?"+":"−")+n(a):"—"}</Text>; })}
              <Text style={[s.tdB,{width:C.net,...catL}]}>{n(thirteenth.net)}</Text>
              <Text style={[s.tdBl,{width:C.lcm,...catL,...noRight}]}>{n(thirteenth.totalLcmPayment)}</Text>
            </View>
          ) : (
            <View style={s.tr}><Text style={[s.tdL,{width:C.mo}]}>13th MTH</Text><Text style={[s.td,{flex:1,...noRight,color:S500}]}>Excluded (Orang Asli)</Text></View>
          )}

          {/* Annual total */}
          <View style={s.trAnn}>
            <Text style={[s.tdAnnL,{width:C.mo}]}>ANNUAL</Text>
            <Text style={[s.tdAnn,{width:C.gr,...catL}]}>{n(sum(l=>l.gross))}</Text>
            <Text style={[s.tdAnn,{width:C.pcb,...catL}]}>{n(sum(l=>l.pcb))}</Text>
            <Text style={[s.tdAnn,{width:C.ee,...catL}]}>{n(sum(l=>l.epf.ee))}</Text>
            <Text style={[s.tdAnn,{width:C.er}]}>{n(sum(l=>l.epf.er))}</Text>
            <Text style={[s.tdAnn,{width:C.se,...catL}]}>{n(sum(l=>l.socso.ee))}</Text>
            <Text style={[s.tdAnn,{width:C.sk}]}>{n(sum(l=>l.skbbk))}</Text>
            <Text style={[s.tdAnn,{width:C.sr}]}>{n(sum(l=>l.socso.er))}</Text>
            <Text style={[s.tdAnn,{width:C.ie,...catL}]}>{n(sum(l=>l.eis.ee))}</Text>
            <Text style={[s.tdAnn,{width:C.ir}]}>{n(sum(l=>l.eis.er))}</Text>
            {hasEpl && <Text style={[s.tdAnnEpl,{width:C.epl,...catL}]}>{n(sum(l=>l.eplDeduction))}</Text>}
            {customCols.map(col=>{ const t=cTotal(col); return <Text key={col.label} style={[col.type==="allowance"?s.tdAnnG:s.tdAnnRed,{width:C.cu,...(col===customCols[0]?catL:{})}]}>{t!==0?(col.type==="allowance"?"+":"−")+n(t):"—"}</Text>; })}
            <Text style={[s.tdAnn,{width:C.net,...catL}]}>{n(sum(l=>l.net))}</Text>
            <Text style={[s.tdAnn,{width:C.lcm,...catL,...noRight}]}>{n(sum(l=>l.totalLcmPayment))}</Text>
          </View>
        </View>

        {/* Notes */}
        <View style={s.notes}>
          <Text style={s.nl}>EPF / SOCSO / EIS auto-calculated. PCB values as entered. Increment effective from {["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"][effMonth-1]}.</Text>
          {hasEpl && <Text style={[s.nl,{color:R700}]}>EPL (red): loan repayment deducted from net salary.</Text>}
          {customCols.filter(c=>c.type==="allowance").length>0 && <Text style={[s.nl,{color:G700}]}>Green columns: special allowances.</Text>}
          {customCols.filter(c=>c.type==="deduction").length>0 && <Text style={[s.nl,{color:R700}]}>Red columns: additional deductions.</Text>}
        </View>

        {/* Signatures */}
        <View style={s.sigRow}>
          <View style={s.sigBox}>
            <View style={s.sigLine} />
            <Text style={s.sigLbl}>Prepared by / Finance Executive</Text>
            <Text style={s.sigDate}>Date: ___________________</Text>
          </View>
          <View style={s.sigBox}>
            <View style={s.sigLine} />
            <Text style={s.sigLbl}>Acknowledged by / {emp.full_name}</Text>
            <Text style={s.sigDate}>Date: ___________________</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
