// A standing warning that this session is a test identity.
//
// Test accounts hold real roles, which is the only way for them to behave like
// the thing they are testing — a Test Treasurer's signature clears a real
// voucher up to RM30,000 exactly as the Treasurer's does, because signing
// resolves by role and the role is genuinely TREASURER.
//
// That fidelity is the point and also the hazard, and the two are inseparable:
// anything that made the account safe would stop it being a faithful test. So
// the account is left alone and the session is labelled instead.
//
// Sticky rather than sitting at the top of the page, because the moment that
// matters is pressing Approve, which is usually well below the fold. A warning
// you scrolled past ten minutes ago is not a warning.
//
// print:hidden — vouchers are printed from these pages and this belongs on a
// screen, not in the church's records.

import { FlaskConical } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { roleWithScope } from "@/lib/utils";

export function TestAccountBanner({ user }: { user: UserProfile }) {
  if (!user.isTestAccount) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-b-2 border-amber-500 bg-amber-100 px-4 py-2 text-amber-900 print:hidden"
    >
      <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide">
        <FlaskConical size={14} className="shrink-0" /> Test account
      </span>
      <span className="text-[12px]">
        Signed in as <strong>{user.full_name}</strong>, {roleWithScope(user.role, user.ministries)}.
        Real permissions on real records: anything approved here counts.
      </span>
    </div>
  );
}
