// Who you are signed in as, on a phone.
//
// The sidebar carries this permanently on a computer — initials, name, address,
// role. On a phone the same block lives inside the More drawer, so a first-time
// user who has just followed a sign-in link has no way of knowing which account
// they landed in without going looking for it. Someone with both a personal
// address and an office one has a real question to answer there, and the answer
// was two taps away.
//
// It scrolls away with the page rather than sticking. The question "am I in the
// right account" is asked on arrival and rarely after, so holding 40px of every
// screen for it would be paying the wrong price — and the whole queue redesign
// this week went the other way.
//
// Tapping it opens the account drawer, so it is also a shortcut to sign out.

"use client";

import type { UserProfile } from "@/lib/types";
import { personInitials } from "@/lib/utils";

export function MobileIdentity({ user, role }: { user: UserProfile; role: string }) {
  const initials = personInitials(user.full_name);

  return (
    <div className="md:hidden border-b border-[#e1edfb] bg-[linear-gradient(135deg,#f6fbff,#f8f5ff)] px-4 py-2">
      <div className="flex items-center gap-2.5">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#dbeafe] text-[11px] font-bold text-[#1d4ed8]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-baseline gap-1.5">
            <span className="truncate text-[13px] font-semibold text-[#274569]">{user.displayName || user.full_name}</span>
            <span className="shrink-0 text-[11px] font-semibold text-[#2563eb]">{role}</span>
          </div>
          {/* The address is the part that actually settles the question — the
              name is the same whichever account they came in on. */}
          <div className="truncate text-[11px] text-[#758ba7]">{user.email}</div>
        </div>
      </div>
    </div>
  );
}
