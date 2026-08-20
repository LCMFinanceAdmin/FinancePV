"use client";
// Official registers — the lists the church hands to somebody outside it.
//
// An auditor asking for the staff list, a bank asking who the signatories are,
// PERKESO asking for the payroll, an embassy asking about one named employee.
// Every one of those answers already lives in this app as a screen, and every
// one of them was being answered by a screenshot or by retyping into Word. A
// retyped list is wrong the moment anything changes, and nothing on the page
// says when it was true.
//
// Each register is assembled here from the records that already exist — no new
// tables, nothing to keep in step — and rendered from one definition to both
// PDF and Excel, so the printed copy and the spreadsheet cannot disagree.
//
// What is offered depends on what the viewer may see, and getting that wrong
// here is worse than a broken button. payroll_employees is readable under
// `can_manage_payroll() OR id = my_payroll_employee_id()`, so somebody without
// payroll rights reading the employee list sees exactly one row: their own.
// A register titled "every person employed by the church", listing one person,
// under a block certifying it a true extract, is a document that would embarrass
// whoever signed it.
//
// So every register drawn from payroll_employees — the employee list, the
// payroll list, and an individual record — is offered only to whoever can see
// all of it. The officer register comes from the office tables, which are
// readable across the church, and stays available.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { th, td, rowCls } from "@/lib/table-styles";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { withTitle, standingLabel } from "@/lib/ministry";
import { roleLabel } from "@/lib/utils";
import { loadRoles } from "@/lib/roles";
import {
  type Register, type RegisterMeta, ORGANISATION,
  fmtDate, registerFilename, downloadBlob,
} from "@/lib/registers";
import { buildRegisterWorkbook } from "@/components/registers/register-excel";
import { buildRegisterPdf } from "@/components/registers/register-pdf";
import {
  buildProfilePdf, buildProfileWorkbook, type EmployeeProfile,
} from "@/components/registers/profile-pdf";
import { svgToPngDataUri } from "@/components/pv/pv-pdf-download";
import { FileText, Sheet, Users, Landmark, Wallet, UserSquare, ShieldAlert } from "lucide-react";

interface Emp {
  id: string; emp_no: string; full_name: string; ic_no: string | null; dob: string | null;
  designation: string | null; employment_type: string | null; is_pastor: boolean;
  posting_type: string | null; church_name: string | null; department: string | null;
  date_commenced: string | null; status: string; resigned_date: string | null;
  epf_no: string | null; tin: string | null; bank_name: string | null; bank_acct: string | null;
  phone_no: string | null; email: string | null; person_id: string | null;
  marital_status: string | null;
}
interface Salary {
  employee_id: string; effective_from: string;
  base_salary: number; stm_allowance: number; experience_bonus: number;
  family_allowance: number; increment_carried: number; increment_current: number;
}
interface PersonRow {
  id: string; full_name: string; ordination: string | null; ministry_status: string | null;
  email: string | null; user_email: string | null; category: string;
}
interface Office {
  id: string; name: string; kind: string; grants_role: string | null;
  parent_office_id: string | null; tenure: string; active: boolean;
  responsibilities: string | null;
}
interface Holding {
  id: string; office_id: string; person_id: string; term_start: string; term_end: string | null;
}

const money = (n: unknown) => Number(n ?? 0);

export default function RegistersPage() {
  const supabase = createClient();
  const [emps, setEmps] = useState<Emp[]>([]);
  const [salaries, setSalaries] = useState<Record<string, Salary>>({});
  const [people, setPeople] = useState<PersonRow[]>([]);
  const [offices, setOffices] = useState<Office[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [canPayroll, setCanPayroll] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [who, setWho] = useState("");
  const [asAt, setAsAt] = useState(new Date().toISOString().slice(0, 10));
  const [profileFor, setProfileFor] = useState("");
  const [active, setActive] = useState("employees");

  // Keep the selected tab on a register that is actually offered — the default
  // is the employee list, which is not available without payroll rights.
  useEffect(() => {
    if (!canPayroll && active !== "officers") setActive("officers");
  }, [canPayroll, active]);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    const [
      { data: e }, { data: s }, { data: p }, { data: o }, { data: h },
      { data: pay }, { data: me },
    ] = await Promise.all([
      supabase.from("payroll_employees").select("*").order("full_name"),
      // Every version; the one in force is picked below. Asking the database
      // for "the latest" per employee needs a lateral join PostgREST cannot
      // express, and the table is small.
      supabase.from("payroll_salary").select("*").order("effective_from", { ascending: true }),
      supabase.from("people")
        .select("id,full_name,ordination,ministry_status,email,user_email,category")
        .order("full_name"),
      supabase.from("offices").select("*").eq("active", true).order("sort_order").order("name"),
      supabase.from("office_holdings").select("id,office_id,person_id,term_start,term_end"),
      supabase.rpc("can_manage_payroll"),
      user?.email
        ? supabase.from("user_roles").select("full_name,role").eq("email", user.email).maybeSingle()
        : Promise.resolve({ data: null }),
      loadRoles(supabase),
    ]);

    setEmps((e ?? []) as Emp[]);
    setPeople((p ?? []) as PersonRow[]);
    setOffices((o ?? []) as Office[]);
    setHoldings((h ?? []) as Holding[]);
    setCanPayroll(pay === true);

    const m = me as { full_name: string | null; role: string | null } | null;
    setWho(m?.full_name
      ? `${m.full_name}${m.role ? `, ${roleLabel(m.role)}` : ""}`
      : (user?.email ?? "the finance system"));
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  // The salary in force on the chosen date — not simply the newest row, or a
  // register dated last month would quote a rise that had not happened yet.
  useEffect(() => {
    supabase.from("payroll_salary").select("*").order("effective_from", { ascending: true })
      .then(({ data }) => {
        const byEmp: Record<string, Salary> = {};
        for (const r of (data ?? []) as Salary[]) {
          if (r.effective_from <= asAt) byEmp[r.employee_id] = r;
        }
        setSalaries(byEmp);
      });
  }, [supabase, asAt]);

  const personById = (id: string | null) => people.find(x => x.id === id) ?? null;
  const nameOf = (e: Emp) => {
    const p = personById(e.person_id);
    return p ? withTitle(e.full_name, p.ordination) : e.full_name;
  };
  const postingOf = (e: Emp) =>
    e.posting_type === "CHURCH" ? (e.church_name || "Congregation") : (e.department || "HQ");

  /** In service on the chosen date, rather than simply flagged active today. */
  const inService = (e: Emp) =>
    e.status !== "RESIGNED" || (e.resigned_date ? e.resigned_date > asAt : false);

  const grossOf = (id: string) => {
    const s = salaries[id];
    if (!s) return 0;
    return money(s.base_salary) + money(s.stm_allowance) + money(s.experience_bonus)
      + money(s.family_allowance) + money(s.increment_carried) + money(s.increment_current);
  };

  // ── The registers ──────────────────────────────────────────────────────────
  const serving = emps.filter(inService);

  const employeeRegister: Register = {
    key: "employees",
    title: "Employee Register",
    purpose: "Every person employed by the church, and the terms of their engagement.",
    columns: [
      { header: "No.", width: 5, flex: 3, align: "center" },
      { header: "Employee No.", width: 13, flex: 8 },
      { header: "Name", width: 30, flex: 20 },
      { header: "I/C No.", width: 16, flex: 11 },
      { header: "Designation", width: 26, flex: 16 },
      { header: "Engagement", width: 14, flex: 9 },
      { header: "Posted at", width: 26, flex: 16 },
      { header: "Commenced", width: 14, flex: 9 },
      { header: "Status", width: 12, flex: 8 },
    ],
    rows: serving.map((e, i) => [
      i + 1, e.emp_no, nameOf(e), e.ic_no, e.designation,
      e.employment_type ? e.employment_type.replace(/_/g, " ") : null,
      postingOf(e), fmtDate(e.date_commenced),
      e.status === "RESIGNED" ? `Resigned ${fmtDate(e.resigned_date)}` : "In service",
    ]),
    note: "Engagement and posting are as recorded on the payroll register. Identity numbers are shown for verification and should be handled accordingly.",
  };

  const officerRegister: Register = (() => {
    const rows: (string | number | null)[][] = [];
    let n = 0;
    for (const o of offices) {
      const current = holdings.filter(
        h => h.office_id === o.id && h.term_start <= asAt && (!h.term_end || h.term_end >= asAt),
      );
      if (current.length === 0) {
        rows.push([++n, o.name, o.tenure === "ELECTED" ? "Elected" : o.tenure === "TEMPORARY" ? "Temporary" : "Permanent",
          "VACANT", null, null, o.grants_role ? roleLabel(o.grants_role) : null]);
        continue;
      }
      for (const h of current) {
        const p = personById(h.person_id);
        rows.push([
          ++n, o.name,
          o.tenure === "ELECTED" ? "Elected" : o.tenure === "TEMPORARY" ? "Temporary" : "Permanent",
          p ? withTitle(p.full_name, p.ordination) : "—",
          fmtDate(h.term_start),
          h.term_end ? fmtDate(h.term_end) : "Current",
          o.grants_role ? roleLabel(o.grants_role) : null,
        ]);
      }
    }
    return {
      key: "officers",
      title: "Register of Officers",
      purpose: "Constitutional posts, portfolios and committees, and who holds each of them.",
      columns: [
        { header: "No.", width: 5, flex: 3, align: "center" },
        { header: "Post", width: 34, flex: 22 },
        { header: "Held as", width: 12, flex: 8 },
        { header: "Holder", width: 30, flex: 20 },
        { header: "Term from", width: 14, flex: 10 },
        { header: "Term to", width: 14, flex: 10 },
        { header: "Authority carried", width: 24, flex: 15 },
      ],
      rows,
      note: "A post shown as VACANT is constituted but unfilled on the date of this register. Authority carried is the access the post grants within the church's finance system.",
    };
  })();

  const payrollRegister: Register = {
    key: "payroll",
    title: "Payroll Register",
    purpose: "Monthly salary and allowances in force, and the statutory and bank details each is paid against.",
    columns: [
      { header: "No.", width: 5, flex: 3, align: "center" },
      { header: "Employee No.", width: 13, flex: 7 },
      { header: "Name", width: 28, flex: 15 },
      { header: "I/C No.", width: 16, flex: 9 },
      { header: "Designation", width: 24, flex: 12 },
      { header: "Basic (RM)", width: 13, flex: 8, align: "right", money: true },
      { header: "Allowances (RM)", width: 15, flex: 8, align: "right", money: true },
      { header: "Gross (RM)", width: 13, flex: 8, align: "right", money: true },
      { header: "EPF No.", width: 14, flex: 8 },
      { header: "Tax No.", width: 14, flex: 8 },
      { header: "Bank", width: 18, flex: 9 },
      { header: "Account No.", width: 20, flex: 10 },
    ],
    rows: serving.map((e, i) => {
      const s = salaries[e.id];
      const basic = money(s?.base_salary);
      const gross = grossOf(e.id);
      return [
        i + 1, e.emp_no, nameOf(e), e.ic_no, e.designation,
        basic, gross - basic, gross,
        e.epf_no, e.tin, e.bank_name, e.bank_acct,
      ];
    }),
    totals: true,
    note: "Salary in force on the date of this register. Allowances combine service, family and any carried or current increment. Gross is before statutory deductions.",
  };

  // Ordered as they are most often asked for, but the employee-derived ones
  // are only correct for somebody who can see every row — see the note at the
  // top of this file.
  const registers: Register[] = canPayroll
    ? [employeeRegister, officerRegister, payrollRegister]
    : [officerRegister];
  const shown = registers.find(r => r.key === active) ?? registers[0];

  const meta = (): RegisterMeta => ({
    organisation: ORGANISATION,
    asAt,
    generatedBy: who,
    generatedAt: new Date().toISOString(),
  });

  async function exportRegister(reg: Register, kind: "pdf" | "xlsx") {
    setErr(""); setBusy(`${reg.key}-${kind}`);
    try {
      const m = meta();
      const blob = kind === "xlsx"
        ? await buildRegisterWorkbook(reg, m)
        : await buildRegisterPdf(reg, m, await svgToPngDataUri("/lcm-logo.svg", 200).catch(() => ""));
      downloadBlob(blob, registerFilename(reg, m, kind));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not produce the file");
    } finally {
      setBusy("");
    }
  }

  /** One person's record, assembled from the same data the registers use. */
  function buildProfile(e: Emp): EmployeeProfile {
    const p = personById(e.person_id);
    const s = salaries[e.id];
    const gross = grossOf(e.id);
    const held = holdings
      .filter(h => h.person_id === e.person_id && h.term_start <= asAt && (!h.term_end || h.term_end >= asAt))
      .map(h => {
        const o = offices.find(x => x.id === h.office_id);
        return [o?.name ?? "—", fmtDate(h.term_start), h.term_end ? fmtDate(h.term_end) : "Current"];
      });

    const sections: EmployeeProfile["sections"] = [
      {
        heading: "Personal particulars",
        fields: [
          { label: "Full name", value: e.full_name },
          { label: "I/C number", value: e.ic_no ?? "" },
          { label: "Date of birth", value: e.dob ? fmtDate(e.dob) : "" },
          { label: "Marital status", value: e.marital_status ?? "" },
          { label: "Email", value: e.email ?? p?.email ?? "" },
          { label: "Telephone", value: e.phone_no ?? "" },
        ],
      },
      {
        heading: "Engagement",
        fields: [
          { label: "Employee number", value: e.emp_no },
          { label: "Designation", value: e.designation ?? "" },
          { label: "Engaged as", value: e.employment_type ? e.employment_type.replace(/_/g, " ") : "" },
          { label: "Posted at", value: postingOf(e) },
          { label: "Date commenced", value: fmtDate(e.date_commenced) },
          {
            label: "Status",
            value: e.status === "RESIGNED" ? `Resigned ${fmtDate(e.resigned_date)}` : "In service",
          },
          ...(p?.ministry_status
            ? [{ label: "Standing in ministry", value: standingLabel(p.ordination, p.ministry_status) ?? "" }]
            : []),
        ],
      },
    ];

    if (canPayroll) {
      sections.push({
        heading: "Remuneration and statutory",
        fields: [
          { label: "Basic salary", value: s ? `RM ${money(s.base_salary).toFixed(2)}` : "not recorded" },
          { label: "Allowances", value: s ? `RM ${(gross - money(s.base_salary)).toFixed(2)}` : "not recorded" },
          { label: "Gross monthly", value: s ? `RM ${gross.toFixed(2)}` : "not recorded" },
          { label: "Effective from", value: s ? fmtDate(s.effective_from) : "" },
          { label: "EPF number", value: e.epf_no ?? "" },
          { label: "Income tax number", value: e.tin ?? "" },
          { label: "Bank", value: e.bank_name ?? "" },
          { label: "Account number", value: e.bank_acct ?? "" },
        ],
      });
    }

    return {
      name: p ? withTitle(e.full_name, p.ordination) : e.full_name,
      subtitle: [e.designation, e.emp_no].filter(Boolean).join(" · "),
      sections,
      tables: [{ heading: "Posts held", columns: ["Post", "From", "To"], rows: held }],
      note: canPayroll
        ? "Gross monthly is before statutory deductions."
        : "Remuneration is not included in this copy.",
    };
  }

  async function exportProfile(kind: "pdf" | "xlsx") {
    const e = emps.find(x => x.id === profileFor);
    if (!e) { setErr("Choose an employee first"); return; }
    setErr(""); setBusy(`profile-${kind}`);
    try {
      const m = meta();
      const profile = buildProfile(e);
      const blob = kind === "xlsx"
        ? await buildProfileWorkbook(profile, m)
        : await buildProfilePdf(profile, m, await svgToPngDataUri("/lcm-logo.svg", 200).catch(() => ""));
      const slug = e.full_name.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      downloadBlob(blob, `LCM-Employee-Record-${slug}-${asAt}.${kind}`);
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Could not produce the file");
    } finally {
      setBusy("");
    }
  }

  if (loading) return <div className="p-8 text-center text-sm text-stone-400">Loading…</div>;

  const TAB_ICON: Record<string, React.ReactNode> = {
    employees: <Users size={14} />, officers: <Landmark size={14} />, payroll: <Wallet size={14} />,
  };

  return (
    <div className="cloudlight-page max-w-7xl space-y-4">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="text-xl font-bold text-stone-800">Official Registers</h1>
        <p className="text-sm text-stone-400">
          The lists the church hands to somebody outside it — an auditor, a bank, a statutory body.
          Each carries the date it speaks for, who produced it, and a block to certify it.
        </p>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-44">
            <label className={labelClass}>Register speaks for</label>
            <input type="date" className={fieldClass} value={asAt}
              onChange={e => setAsAt(e.target.value)} />
          </div>
          <p className="flex-1 text-[12px] text-stone-500">
            Every register is built as at this date — who was in service, who held which post, and the
            salary in force then. Change it to produce a register for a date that has passed rather
            than restating today&apos;s position as though it were history.
          </p>
        </div>
      </Card>

      {/* ── The list registers ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-1.5">
        {registers.map(r => (
          <button key={r.key} onClick={() => setActive(r.key)}
            className={`inline-flex items-center gap-1.5 rounded-lg border-2 px-3 py-1.5 !text-[12px] !font-bold transition-colors ${
              active === r.key
                ? "border-[#2f5b9c] bg-[#eef4fd] text-[#2f5b9c]"
                : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"}`}>
            {TAB_ICON[r.key]} {r.title}
          </button>
        ))}
      </div>

      {shown && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-stone-100 bg-stone-50 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-bold text-stone-800">{shown.title}</h2>
              <p className="text-[12px] text-stone-500">{shown.purpose}</p>
            </div>
            <span className="text-[12px] text-stone-400">
              {shown.rows.length} record{shown.rows.length === 1 ? "" : "s"} as at {fmtDate(asAt)}
            </span>
            <Button size="sm" variant="secondary" loading={busy === `${shown.key}-pdf`}
              onClick={() => exportRegister(shown, "pdf")}>
              <FileText size={13} /> PDF
            </Button>
            <Button size="sm" variant="secondary" loading={busy === `${shown.key}-xlsx`}
              onClick={() => exportRegister(shown, "xlsx")}>
              <Sheet size={13} /> Excel
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead className="bg-white">
                <tr className="divide-x divide-stone-100 border-b border-stone-200">
                  {shown.columns.map(c => (
                    <th key={c.header} className={`${th} ${c.align === "right" ? "text-right" : ""}`}>
                      {c.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.rows.length === 0 && (
                  <tr className="border-t border-stone-100">
                    <td colSpan={shown.columns.length} className="px-3 py-8 text-center text-sm text-stone-400">
                      Nothing on this register as at {fmtDate(asAt)}.
                    </td>
                  </tr>
                )}
                {shown.rows.map((r, ri) => (
                  <tr key={ri} className={rowCls}>
                    {r.map((v, ci) => {
                      const c = shown.columns[ci];
                      return (
                        <td key={ci}
                          className={`${td} px-3 !text-[12px] ${c?.align === "right" ? "text-right tabular-nums" : ""} ${
                            v === "VACANT" ? "font-bold text-amber-700" : ""}`}>
                          {c?.money && typeof v === "number"
                            ? v.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                            : (v ?? "—")}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {shown.note && (
            <p className="border-t border-stone-100 px-4 py-2 text-[11px] text-stone-500">{shown.note}</p>
          )}
        </Card>
      )}

      {/* ── One person ─────────────────────────────────────────────────── */}
      {canPayroll ? (
      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <UserSquare size={16} className="text-[#4a6da7]" />
          <h2 className="text-base font-bold text-stone-800">Individual employee record</h2>
        </div>
        <p className="mb-3 text-[12px] text-stone-500">
          For when the question is about one named person rather than the whole list — a bank
          confirming employment, an embassy asking for particulars. A one-row extract of the staff
          list does not answer that; this reads as a record sheet.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[260px] flex-1">
            <label className={labelClass}>Employee</label>
            <select className={fieldClass} value={profileFor} onChange={e => setProfileFor(e.target.value)}>
              <option value="">— choose an employee —</option>
              {emps.map(e => (
                <option key={e.id} value={e.id}>
                  {e.full_name} · {e.emp_no}{inService(e) ? "" : " (resigned)"}
                </option>
              ))}
            </select>
          </div>
          <Button size="sm" variant="secondary" disabled={!profileFor}
            loading={busy === "profile-pdf"} onClick={() => exportProfile("pdf")}>
            <FileText size={13} /> PDF
          </Button>
          <Button size="sm" variant="secondary" disabled={!profileFor}
            loading={busy === "profile-xlsx"} onClick={() => exportProfile("xlsx")}>
            <Sheet size={13} /> Excel
          </Button>
        </div>
      </Card>
      ) : (
        <Card className="flex flex-wrap items-start gap-2 p-4">
          <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-stone-800">
              Employee, payroll and individual records need payroll access
            </h2>
            <p className="mt-1 text-[12px] text-stone-500">
              Employment records are readable only by payroll, apart from your own. A register built
              from what you can see would list one person while calling itself the church&apos;s
              employee list — and it would carry a block certifying it true. Rather than issue that,
              these three are withheld. The Register of Officers above is complete and yours to use.
            </p>
          </div>
        </Card>
      )}

      {err && (
        <p className="rounded-xl border-2 border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700"
          role="alert">{err}</p>
      )}

      <p className="text-[11px] text-stone-400">
        Registers are produced from live records at the moment you press the button. Nothing is stored,
        so a copy shared last month does not change when the underlying record does — which is why each
        one states the date it speaks for.
      </p>
    </div>
  );
}
