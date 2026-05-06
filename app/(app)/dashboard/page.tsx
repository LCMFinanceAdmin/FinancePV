import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Card, CardBody } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { PV, UserProfile } from "@/lib/types";
import Link from "next/link";
import { FilePlus, Clock, CheckCircle, AlertCircle } from "lucide-react";

async function getDashboardData(user: UserProfile) {
  const supabase = await createClient();

  const { data: pvs } = await supabase
    .from("pvs")
    .select("id,pv_no,status,amount,payee_name,ministry,submitted_at,purpose")
    .eq("submitted_by_email", user.email)
    .order("submitted_at", { ascending: false })
    .limit(5);

  const { count: pendingCount } = await supabase
    .from("pvs")
    .select("id", { count: "exact", head: true })
    .in("status", ["PENDING", "PENDING_HEAD", "MINISTRY_VERIFIED", "REVIEWED", "PENDING_SIGNATORY"])
    .eq("submitted_by_email", user.email);

  const { count: approvedCount } = await supabase
    .from("pvs")
    .select("id", { count: "exact", head: true })
    .in("status", ["APPROVED", "PAID"])
    .eq("submitted_by_email", user.email);

  return { pvs: pvs ?? [], pendingCount: pendingCount ?? 0, approvedCount: approvedCount ?? 0 };
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("user_roles")
    .select("*")
    .eq("email", user.email)
    .single();

  const userProfile: UserProfile = {
    id: user.id,
    email: user.email!,
    full_name: profile?.full_name ?? user.user_metadata?.full_name ?? user.email!,
    role: profile?.role ?? "STAFF",
    ministries: profile?.ministries ?? [],
    isFinanceAdmin: ["FINANCE_ADMIN", "FINANCE_ADMIN_2", "FINANCE_ADMIN_3"].includes(profile?.role),
    isSignatory: ["BISHOP", "TREASURER", "SECRETARY", "GENERAL_MANAGER"].includes(profile?.role),
    signatoryRole: profile?.role ?? "",
    isMinistryHead: profile?.role === "MINISTRY_HEAD",
    isGeneralManager: profile?.role === "GENERAL_MANAGER",
  };

  const { pvs, pendingCount, approvedCount } = await getDashboardData(userProfile);

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-stone-800">
          Welcome, {userProfile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-stone-400">Here's a summary of your payment vouchers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Clock size={18} className="text-amber-500" />} label="In Progress" value={pendingCount} />
        <StatCard icon={<CheckCircle size={18} className="text-green-500" />} label="Approved" value={approvedCount} />
        <StatCard icon={<AlertCircle size={18} className="text-[#4a6da7]" />} label="Total" value={pendingCount + approvedCount} />
      </div>

      {/* Quick action */}
      <Link
        href="/submit"
        className="flex items-center gap-3 p-4 bg-[#4a6da7] hover:bg-[#3a5a8f] text-white rounded-xl transition-colors"
      >
        <FilePlus size={20} />
        <div>
          <div className="font-semibold text-sm">Submit New PV</div>
          <div className="text-xs text-blue-200">Create a payment voucher request</div>
        </div>
      </Link>

      {/* Recent PVs */}
      <Card>
        <div className="px-5 py-4 border-b border-stone-100 flex justify-between items-center">
          <h2 className="font-semibold text-stone-700 text-sm">Recent PVs</h2>
          <Link href="/my-pvs" className="text-xs text-[#4a6da7] hover:underline">View all</Link>
        </div>
        {pvs.length === 0 ? (
          <CardBody>
            <p className="text-sm text-stone-400 text-center py-4">No payment vouchers yet</p>
          </CardBody>
        ) : (
          <div className="divide-y divide-stone-100">
            {pvs.map((pv: Partial<PV>) => (
              <Link key={pv.id} href={`/my-pvs/${pv.id}`} className="flex items-start gap-3 px-5 py-3.5 hover:bg-stone-50 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-semibold text-stone-600">{pv.pv_no}</span>
                    <StatusBadge status={pv.status!} />
                  </div>
                  <div className="text-sm text-stone-700 truncate">{pv.payee_name}</div>
                  <div className="text-xs text-stone-400 mt-0.5">{pv.ministry} · {formatDate(pv.submitted_at!)}</div>
                </div>
                <div className="text-sm font-semibold text-stone-700 whitespace-nowrap">
                  {formatCurrency(pv.amount!)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card>
      <CardBody className="flex flex-col items-center gap-1 py-3 text-center">
        {icon}
        <div className="text-xl font-bold text-stone-800">{value}</div>
        <div className="text-xs text-stone-400">{label}</div>
      </CardBody>
    </Card>
  );
}
