"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { CheckCircle, XCircle, Search, Filter } from "lucide-react";
import Link from "next/link";

const SIGNATORY_ROLES = ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"];
const ROLE_LABELS: Record<string, string> = {
  BISHOP: "Bishop", TREASURER: "Treasurer",
  SECRETARY: "Secretary", GENERAL_MANAGER: "General Manager",
};

interface ApprovalRow {
  pvId: string;
  pvNo: string;
  applicantName: string;
  ministry: string;
  dept: string;
  amount: number;
  role: string;
  signatoryName: string;
  signatoryEmail: string;
  action: "APPROVED" | "REJECTED";
  timestamp: string;
  remarks: string;
}

export default function SignatoryActivityPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterRole, setFilterRole] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("pvs")
        .select("id,pv_no,applicant_name,ministry,dept,amount,approvals")
        .not("approvals", "eq", "[]")
        .order("updated_at", { ascending: false });

      const flat: ApprovalRow[] = [];
      for (const pv of data ?? []) {
        const approvals: Array<{ role: string; email: string; name: string; action: string; timestamp: string; remarks: string }> =
          pv.approvals ?? [];
        for (const a of approvals) {
          if (!SIGNATORY_ROLES.includes(a.role)) continue;
          flat.push({
            pvId: pv.id,
            pvNo: pv.pv_no,
            applicantName: pv.applicant_name ?? "",
            ministry: pv.ministry ?? "",
            dept: pv.dept ?? "",
            amount: pv.amount ?? 0,
            role: a.role,
            signatoryName: a.name ?? a.email,
            signatoryEmail: a.email ?? "",
            action: a.action as "APPROVED" | "REJECTED",
            timestamp: a.timestamp,
            remarks: a.remarks ?? "",
          });
        }
      }

      flat.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRows(flat);
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterRole !== "ALL" && r.role !== filterRole) return false;
      if (filterAction !== "ALL" && r.action !== filterAction) return false;
      if (filterFrom && r.timestamp < filterFrom) return false;
      if (filterTo && r.timestamp > filterTo + "T23:59:59") return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.pvNo.toLowerCase().includes(q) &&
            !r.signatoryName.toLowerCase().includes(q) &&
            !r.applicantName.toLowerCase().includes(q) &&
            !r.ministry.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterRole, filterAction, filterFrom, filterTo, search]);

  const approvedCount = filtered.filter(r => r.action === "APPROVED").length;
  const rejectedCount = filtered.filter(r => r.action === "REJECTED").length;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">Signatory Activity</h1>
        <p className="text-sm text-stone-400">All PV approvals and rejections by authorised signatories</p>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm text-green-700 font-medium">
          <CheckCircle size={14} /> {approvedCount} Approved
        </div>
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-200 rounded-full text-sm text-red-700 font-medium">
          <XCircle size={14} /> {rejectedCount} Rejected
        </div>
        <div className="px-3 py-1.5 bg-stone-100 rounded-full text-sm text-stone-600 font-medium">
          {filtered.length} total actions
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardBody className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-stone-600">
            <Filter size={14} /> Filters
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-stone-500 mb-1">Signatory Role</label>
              <select className={sel} value={filterRole} onChange={e => setFilterRole(e.target.value)}>
                <option value="ALL">All Roles</option>
                {SIGNATORY_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Action</label>
              <select className={sel} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="ALL">All Actions</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">From Date</label>
              <input type="date" className={sel} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">To Date</label>
              <input type="date" className={sel} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
            </div>
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              className={`${sel} pl-8`}
              placeholder="Search PV no., signatory, applicant, ministry…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </CardBody>
      </Card>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-stone-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <Card><CardBody><p className="text-sm text-stone-400 text-center py-8">No signatory actions found</p></CardBody></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-xs text-stone-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">PV No.</th>
                  <th className="px-4 py-3 text-left font-medium">Applicant</th>
                  <th className="px-4 py-3 text-left font-medium">Ministry</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">Signatory</th>
                  <th className="px-4 py-3 text-left font-medium">Role</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                  <th className="px-4 py-3 text-left font-medium">Date & Time</th>
                  <th className="px-4 py-3 text-left font-medium">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map((r, i) => (
                  <tr key={i} className="hover:bg-stone-50/50 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/my-pvs/${r.pvId}`} className="text-[#4a6da7] font-medium hover:underline">
                        {r.pvNo}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{r.applicantName || "—"}</td>
                    <td className="px-4 py-3 text-stone-500 text-xs">{r.ministry || r.dept || "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-stone-700">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 text-stone-700">{r.signatoryName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 font-medium">
                        {ROLE_LABELS[r.role] ?? r.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.action === "APPROVED" ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircle size={13} /> Approved
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-medium text-red-600">
                          <XCircle size={13} /> Rejected
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-500 whitespace-nowrap">{formatDateTime(r.timestamp)}</td>
                    <td className="px-4 py-3 text-xs text-stone-500 max-w-[180px] truncate" title={r.remarks}>{r.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const sel = "w-full border border-stone-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#4a6da7] bg-white";
