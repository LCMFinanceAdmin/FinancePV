"use client";
// Plain-English help, attached to the page it explains.
//
// Written for someone who has been asked to use this system as part of their
// church role, not because they wanted new software. So: no jargon, no
// abbreviations without expansion, and every entry answers "what am I looking
// at" and "what do I do here" — in that order, because someone who is lost
// can't act on instructions yet.
//
// It opens itself the first time a person visits a page, then stays out of the
// way behind the "?" button. The first-visit flag is per page and per browser,
// so nobody gets the same explanation twice.

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { HelpCircle, X, Check } from "lucide-react";

export interface PageGuide {
  title: string;
  /** One sentence: what this page is. */
  what: string;
  /** The things a person does here, in the order they'd do them. */
  steps: string[];
  /** Things worth knowing that aren't a step. */
  notes?: string[];
}

export const PAGE_GUIDES: Record<string, PageGuide> = {
  "/dashboard": {
    title: "Dashboard",
    what: "Your starting point. It shows what is waiting on you today and gives you a way into everything else.",
    steps: [
      "Read the four coloured boxes at the top — they count what is in progress, approved, and waiting for you.",
      "Use the Quick Actions tiles for the things you do most often.",
      "Scroll to All Features to find any part of the system, with a short line saying what each one is for.",
      "If you can't remember where something lives, type it into the Find a feature box.",
    ],
  },
  "/submit": {
    title: "Submit a Payment Voucher",
    what: "This is the form used to ask for a payment to be made — a claim, a bill, or money owed to someone.",
    steps: [
      "Fill in who is being paid and their bank details.",
      "Choose the ministry and, if there is one, the project the money comes from.",
      "Describe what the payment is for, then list the items and amounts.",
      "Attach the receipt, invoice or bill — a payment cannot be approved without evidence.",
      "Sign at the bottom and press Submit.",
    ],
    notes: [
      "If this payment corrects an earlier voucher, put that voucher number in Relates to PV so the approvers can see why.",
      "You can track what happens to it afterwards under My PVs or Finance Activity.",
    ],
  },
  "/my-leaves": {
    title: "My Leave",
    what: "Where you apply for leave and see how many days you have left.",
    steps: [
      "The Balance tab shows your entitlement and what you have used this year.",
      "Press Apply for Leave, choose the type, and pick your first and last day off.",
      "Give a short reason, sign in the box, and submit.",
      "The people who must approve it are worked out for you and told by email straight away.",
    ],
    notes: [
      "While it is still pending you can press Edit to change the dates, or Withdraw to take it back.",
      "Editing clears any approval already given, because those officers agreed to different dates.",
      "Once it is fully approved, View signed form gives you a printable copy with everyone's signature.",
    ],
  },
  "/leave-queue": {
    title: "Leave Queue",
    what: "Leave applications from staff that are waiting for your approval.",
    steps: [
      "Read the application — who is asking, which dates, and why.",
      "Press Approve, sign your name in the box, then press Sign & Approve.",
      "If you cannot agree to it, press Reject and give a reason. The reason is sent to the applicant.",
    ],
    notes: [
      "Some applications need more than one person. The card tells you who else must approve; the leave is only granted once everyone has.",
      "Nothing happens to the applicant's leave balance until every approver has signed.",
    ],
  },
  "/signatory": {
    title: "Signatory Queue",
    what: "Payment vouchers waiting for your signature as Bishop, Treasurer or Secretary.",
    steps: [
      "Check the payee, the amount and what the payment is for.",
      "Look at the budget line shown on the card — it tells you whether this spend is within the approved budget.",
      "Press Approve to sign, or Reject with a reason.",
    ],
    notes: [
      "Vouchers over RM30,000 need two officers. The card says which.",
      "You can select several vouchers and approve them together.",
    ],
  },
  "/gm-claims": {
    title: "GM Claims",
    what: "Payments the General Manager has accepted, which Finance now needs to turn into payment vouchers.",
    steps: [
      "A yellow row is new and has not been dealt with yet.",
      "Open the row to see the amount, the account details and the ministry's verification.",
      "Raise the payment voucher from there — the details are carried over for you.",
    ],
  },
  "/control-center": {
    title: "Control Center",
    what: "Everything Finance needs to move along: vouchers waiting to be checked, approved or paid.",
    steps: [
      "Work down the list — each voucher shows which stage it is at.",
      "Open one to check the details and attachments before passing it on.",
      "Use Review to send it forward, or Reject with a reason to send it back.",
    ],
  },
  "/signatory-activity": {
    title: "Finance Activity",
    what: "Every payment voucher in the system, grouped by what stage it has reached.",
    steps: [
      "Use the coloured tabs to see vouchers at each stage.",
      "The Paid tab holds all completed payments, filed by year and month.",
      "To find an old payment, use the search box — it looks through the whole history, not just what is on screen.",
    ],
  },
  "/recurring": {
    title: "Recurring Expenses",
    what: "Payments that repeat — rent, allowances, utilities. Set them up once and produce the vouchers each period.",
    steps: [
      "Folders group the payments; open one to see what is inside.",
      "Use Run this folder to create the vouchers for a whole group at once.",
      "Choose the month you are paying for — the vouchers will say that month.",
    ],
  },
  "/budget": {
    title: "Ministry Budget",
    what: "What each ministry was given for the year and what it has spent so far.",
    steps: [
      "Pick the ministry and the year at the top.",
      "Each row is a project, showing the budget, what has been spent, and what is left.",
      "Print report produces a Budget vs Actual you can take to a meeting.",
    ],
  },
  "/payroll/runs": {
    title: "Payroll Runs",
    what: "Monthly salary runs — working out pay, confirming it, and producing the payment vouchers.",
    steps: [
      "Open the month you are working on.",
      "Check each person's figures, then confirm the run.",
      "Generate PV creates the salary voucher along with EPF, SOCSO and PCB, with the payslips attached.",
    ],
    notes: [
      "If something is wrong after confirming, you can revert the run. Any vouchers already sent for approval are retracted.",
    ],
  },
  "/settings/people": {
    title: "People & Roles",
    what: "Everyone who can use the system, what they may do, and who approves their leave.",
    steps: [
      "Click a person's row to open their details.",
      "Set their role — this decides what they can see and approve.",
      "Tick Employed by LCM for staff; leave it unticked for volunteers, who then have no leave or payroll.",
      "For pastors, tick Pastor and choose their congregation.",
    ],
    notes: [
      "The blue Leave goes to line shows you who will approve that person's leave, so a mistake is visible here rather than later.",
    ],
  },
  "/settings/directory": {
    title: "Church Directory",
    what: "Districts, congregations, and the people who lead them.",
    steps: [
      "Add each district and choose its Dean.",
      "Add each congregation, put it in a district, and choose its head pastor.",
      "Add the church council President and their email — they approve pastors' leave by a link, without needing an account.",
    ],
  },
};

const seenKey = (path: string) => `lcm-help-seen:${path}`;

export function PageHelp() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const guide = PAGE_GUIDES[pathname];

  // Open once, the first time this person sees this page.
  useEffect(() => {
    if (!guide) return;
    try {
      if (!localStorage.getItem(seenKey(pathname))) setOpen(true);
    } catch { /* private browsing — just don't auto-open */ }
  }, [pathname, guide]);

  function close() {
    setOpen(false);
    try { localStorage.setItem(seenKey(pathname), "1"); } catch { /* ignore */ }
  }

  if (!guide) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="What is this page?"
        aria-label="What is this page?"
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-[#1d4ed8] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(29,78,216,.35)] transition-transform hover:scale-105 print:hidden md:bottom-6 md:right-6"
      >
        <HelpCircle size={18} /> Help
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4 print:hidden">
          <div className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-[#dbe9fb] bg-white shadow-2xl sm:rounded-3xl">
            <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-stone-100 bg-white px-6 pb-4 pt-6">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">
                  How this page works
                </p>
                <h2 className="text-xl font-bold text-stone-800">{guide.title}</h2>
              </div>
              <button onClick={close} aria-label="Close"
                className="rounded-full p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-5 px-6 py-5">
              <p className="text-[17px] leading-relaxed text-stone-700">{guide.what}</p>

              <div>
                <p className="mb-2 text-sm font-bold uppercase tracking-wide text-stone-500">What to do</p>
                <ol className="space-y-2.5">
                  {guide.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#eaf2ff] text-sm font-bold text-[#1d4ed8]">
                        {i + 1}
                      </span>
                      <span className="pt-0.5 text-[16px] leading-relaxed text-stone-700">{s}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {guide.notes && guide.notes.length > 0 && (
                <div className="rounded-2xl border border-[#dbe9fb] bg-[#f4f9ff] p-4">
                  <p className="mb-2 text-sm font-bold uppercase tracking-wide text-[#4f7fc3]">Worth knowing</p>
                  <ul className="space-y-2">
                    {guide.notes.map((n, i) => (
                      <li key={i} className="flex gap-2.5 text-[15px] leading-relaxed text-stone-600">
                        <Check size={16} className="mt-1 shrink-0 text-[#4a6da7]" />
                        <span>{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="sticky bottom-0 border-t border-stone-100 bg-white px-6 py-4">
              <button onClick={close}
                className="w-full rounded-xl bg-[#1d4ed8] py-3.5 text-[16px] font-bold text-white">
                Got it
              </button>
              <p className="mt-2 text-center text-xs text-stone-400">
                You can open this again any time with the Help button.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
