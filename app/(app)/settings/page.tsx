import Link from "next/link";
import { Card, CardBody } from "@/components/ui/card";
import { Building2, Users, Settings2, FileText, Church } from "lucide-react";

const SECTIONS = [
  { href: "/settings/lookups",     icon: <Building2 size={20} />,  label: "Lookups",              desc: "Manage departments, ministries & projects" },
  { href: "/settings/signatories", icon: <Users size={20} />,      label: "Signatories & Roles",  desc: "Add users, assign roles, manage approval PINs" },
  { href: "/settings/directory",   icon: <Church size={20} />,     label: "Church Directory",     desc: "Districts, Deans, congregations & head pastors" },
  { href: "/settings/claims",      icon: <Settings2 size={20} />,  label: "Claim Settings",       desc: "Mileage rate, loan limits, allowance caps" },
  { href: "/settings/policies",    icon: <FileText size={20} />,   label: "Claim Policies",       desc: "Policy text shown on the submission form" },
];

export default function SettingsPage() {
  return (
    <div className="cloudlight-page max-w-4xl space-y-5">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">Administration</p>
        <h1 className="text-xl font-bold text-stone-800">Settings</h1>
        <p className="text-sm text-stone-400">Finance Executive controls</p>
      </div>
      <div className="space-y-2">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href}>
            <Card className="cursor-pointer rounded-2xl transition-all hover:border-[#75a8f2] hover:shadow-[0_12px_30px_rgba(41,87,149,0.12)]">
              <CardBody className="flex items-center gap-4">
                <div className="p-2.5 rounded-xl bg-[#4a6da7]/10 text-[#4a6da7]">{s.icon}</div>
                <div>
                  <div className="text-sm font-semibold text-stone-800">{s.label}</div>
                  <div className="text-xs text-stone-400">{s.desc}</div>
                </div>
              </CardBody>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
