"use client";
import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Card, CardBody } from "@/components/ui/card";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { CheckCircle, XCircle, Search, Filter } from "lucide-react";
import Link from "next/link";

interface HodRow {
  pvId: string;
  pvNo: string;
  applicantName: string;
  ministry: string;
  dept: string;
  amount: number;
  hodName: string;
  hodEmail: string;
  action: "VERIFIED" | "REJECTED";
  timestamp: string;
  remarks: string;
}

export default function HodActivityPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<HodRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [ministries, setMinistries] = useState<string[]>([]);

  const [filterMinistry, setFilterMinistry] = useState("ALL");
  const [filterAction, setFilterAction] = useState("ALL");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function load() {
      const [{ data: pvData }, { data: minData }] = await Promise.all([
        supabase
          .from("pvs")
          .select("id,pv_no,applicant_name,ministry,dept,amount,approvals,ministry_verified,ministry_verified_by,ministry_verified_at,head_verified,head_verified_at")
          .order("updated_at", { ascending: false }),
        supabase.from("ministries").select("name").order("name"),
      ]);

      const flat: HodRow[] = [];

      for (const pv of pvData ?? []) {
        // Pull HOD actions from the approvals JSONB array
        const approvals: Array<{ role: string; email: string; name: string; action: string; timestamp: string; remarks: string }> =
          pv.approvals ?? [];
        for (const a of approvals) {
          if (a.role !== "MINISTRY_HEAD") continue;
          flat.push({
            pvId: pv.id,
            pvNo: pv.pv_no,
            applicantName: pv.applicant_name ?? "",
            ministry: pv.ministry ?? "",
            dept: pv.dept ?? "",
            amount: pv.amount ?? 0,
            hodName: a.name ?? a.email,
            hodEmail: a.email ?? "",
            action: a.action === "REJECTED" ? "REJECTED" : "VERIFIED",
            timestamp: a.timestamp,
            remarks: a.remarks ?? "",
          });
        }

        // Also surface legacy ministry_verified_by field if not already captured via approvals
        const alreadyCaptured = approvals.some(a => a.role === "MINISTRY_HEAD");
        if (!alreadyCaptured && pv.ministry_verified_by && pv.ministry_verified_at) {
          flat.push({
            pvId: pv.id,
            pvNo: pv.pv_no,
            applicantName: pv.applicant_name ?? "",
            ministry: pv.ministry ?? "",
            dept: pv.dept ?? "",
            amount: pv.amount ?? 0,
            hodName: pv.ministry_verified_by,
            hodEmail: "",
            action: pv.ministry_verified === "REJECTED" ? "REJECTED" : "VERIFIED",
            timestamp: pv.ministry_verified_at,
            remarks: "",
          });
        }
      }

      flat.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setRows(flat);
      setMinistries((minData ?? []).map((m: { name: string }) => m.name));
      setLoading(false);
    }
    load();
  }, []);

  const filtered = useMemo(() => {
    return rows.filter(r => {
      if (filterMinistry !== "ALL" && r.ministry !== filterMinistry) return false;
      if (filterAction !== "ALL" && r.action !== filterAction) return false;
      if (filterFrom && r.timestamp < filterFrom) return false;
      if (filterTo && r.timestamp > filterTo + "T23:59:59") return false;
      if (search) {
        const q = search.toLowerCase();
        if (!r.pvNo.toLowerCase().includes(q) &&
            !r.hodName.toLowerCase().includes(q) &&
            !r.applicantName.toLowerCase().includes(q) &&
            !r.ministry.toLowerCase().includes(q) &&
            !r.dept.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, filterMinistry, filterAction, filterFrom, filterTo, search]);

  const verifiedCount = filtered.filter(r => r.action === "VERIFIED").length;
  const rejectedCount = filtered.filter(r => r.action === "REJECTED").length;

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-stone-800">EXCO Activity</h1>
        <p className="text-sm text-stone-400">All PV verifications and rejections by EXCO Members / Ministry Heads</p>
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-sm text-green-700 font-medium">
          <CheckCircle size={14} /> {verifiedCount} Verified
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
              <label className="block text-xs text-stone-500 mb-1">Ministry</label>
              <select className={sel} value={filterMinistry} onChange={e => setFilterMinistry(e.target.value)}>
                <option value="ALL">All Ministries</option>
                {ministries.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-1">Action</label>
              <select className={sel} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
                <option value="ALL">All Actions</option>
                <option value="VERIFIED">Verified</option>
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
              placeholder="Search PV no., HOD name, applicant, ministry, department…"
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
        <Card><CardBody><p className="text-sm text-stone-400 text-center py-8">No HOD verification actions found</p></CardBody></Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 text-xs text-stone-500 uppercase tracking-wide">
                  <th className="px-4 py-3 text-left font-medium">PV No.</th>
                  <th className="px-4 py-3 text-left font-medium">Applicant</th>
                  <th className="px-4 py-3 text-left font-medium">Ministry / Dept</th>
                  <th className="px-4 py-3 text-right font-medium">Amount</th>
                  <th className="px-4 py-3 text-left font-medium">HOD / Ministry Head</th>
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
                    <td className="px-4 py-3 text-xs text-stone-500">
                      <div>{r.ministry || "—"}</div>
                      {r.dept && r.dept !== r.ministry && (
                        <div className="text-stone-400">{r.dept}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-stone-700">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3 text-stone-700">{r.hodName || "—"}</td>
                    <td className="px-4 py-3">
                      {r.action === "VERIFIED" ? (
                        <span className="flex items-center gap-1 text-xs font-medium text-green-700">
                          <CheckCircle size={13} /> Verified
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
