"use client";

// A message that says what just happened, and then goes away.
//
// The payroll pages used the browser's own alert() and confirm() for this. Both
// say "finance-pv.vercel.app says" above whatever you wrote, both block the
// page until they are dismissed, and neither can be styled, so a message about
// a salary looked like a warning from a website. Worse for confirm(): the text
// of the thing being deleted arrives as a wall of unformatted lines, and the
// default button is OK.
//
// Toasts are for things that went right. Anything that needs an answer before
// it happens is a ConfirmDialog, not this.
//
// Each page holds its own — there is no provider — because that is how the rest
// of this app already does it, and a toast that outlives the page that raised
// it would be a different and worse thing.

import { useState, useCallback, useEffect } from "react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

export type ToastTone = "ok" | "error" | "info";

export interface ToastMessage {
  msg: string;
  /** A second line, for the figure or the name the message is about. */
  detail?: string;
  tone: ToastTone;
  /** Bumped on every call so repeating the same message re-triggers it. */
  key: number;
}

export interface ToastHandle {
  toast: ToastMessage | null;
  /** Say something went right. */
  ok: (msg: string, detail?: string) => void;
  /** Say something failed. Held longer — a failure is worth reading twice. */
  fail: (msg: string, detail?: string) => void;
  info: (msg: string, detail?: string) => void;
  dismiss: () => void;
}

export function useToast(): ToastHandle {
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const raise = useCallback((tone: ToastTone, msg: string, detail?: string) => {
    setToast({ msg, detail, tone, key: Date.now() });
  }, []);

  return {
    toast,
    ok: useCallback((m: string, d?: string) => raise("ok", m, d), [raise]),
    fail: useCallback((m: string, d?: string) => raise("error", m, d), [raise]),
    info: useCallback((m: string, d?: string) => raise("info", m, d), [raise]),
    dismiss: useCallback(() => setToast(null), []),
  };
}

const TONE = {
  ok:    { bar: "bg-green-500", icon: "text-green-600", Icon: CheckCircle2 },
  error: { bar: "bg-red-500",   icon: "text-red-600",   Icon: XCircle },
  info:  { bar: "bg-[#4a6da7]", icon: "text-[#4a6da7]", Icon: Info },
} as const;

/**
 * Renders the handle's current message, or nothing.
 *
 * Mounted to the corner rather than inline, so a confirmation about a figure
 * near the bottom of a long sheet is seen without scrolling back.
 *
 * The message is keyed, so each one is a fresh mount of the body below. That
 * is what makes the entry animation replay when the same message is raised
 * twice, and it keeps the "not yet shown" state out of this component — which
 * would otherwise have to be reset synchronously every time a toast cleared.
 */
export function Toast({ handle }: { handle: ToastHandle }) {
  if (!handle.toast) return null;
  return <ToastBody key={handle.toast.key} toast={handle.toast} dismiss={handle.dismiss} />;
}

function ToastBody({ toast, dismiss }: { toast: ToastMessage; dismiss: () => void }) {
  // Starts off-position so the entry transition has something to move from,
  // and is only ever moved by the frame and the timers below.
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const entry = requestAnimationFrame(() => setShown(true));
    // A failure stays longer: it usually needs acting on, not just noting.
    const hold = toast.tone === "error" ? 6000 : 3500;
    const leaving = setTimeout(() => setShown(false), hold);
    const gone = setTimeout(dismiss, hold + 200);
    return () => { cancelAnimationFrame(entry); clearTimeout(leaving); clearTimeout(gone); };
  }, [toast.tone, dismiss]);

  const { bar, icon, Icon } = TONE[toast.tone];

  return (
    <div
      // Announced to a screen reader as it arrives; assertive for a failure,
      // since that one is worth interrupting for.
      role="status"
      aria-live={toast.tone === "error" ? "assertive" : "polite"}
      className={`fixed right-4 top-4 z-[60] flex w-[min(22rem,calc(100vw-2rem))] overflow-hidden
        rounded-xl border border-stone-200 bg-white shadow-[0_12px_32px_rgba(22,51,94,0.18)]
        transition-all duration-200 print:hidden
        ${shown ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"}`}
    >
      <span className={`w-1 shrink-0 ${bar}`} aria-hidden />
      <div className="flex flex-1 items-start gap-2.5 px-3 py-2.5">
        <Icon size={16} className={`mt-px shrink-0 ${icon}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-stone-800">{toast.msg}</p>
          {toast.detail && (
            <p className="mt-0.5 text-[12px] leading-snug text-stone-500">{toast.detail}</p>
          )}
        </div>
        <button onClick={dismiss} aria-label="Dismiss"
          className="-mr-0.5 -mt-0.5 shrink-0 rounded p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-600">
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
