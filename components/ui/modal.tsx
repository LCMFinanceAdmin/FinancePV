"use client";
// A dialog that behaves like one.
//
// The app had grown a dozen hand-rolled modals: a fixed backdrop, a white card,
// and a close button. They looked right and were unusable with a keyboard —
// Tab wandered off behind the overlay into the page underneath, Escape did
// nothing, and a screen reader announced neither that a dialog had opened nor
// what it was for. Someone who cannot use a mouse could open the Add Person
// dialog and never reach its Save button.
//
// This is one dialog, used by all of them:
//   · Escape closes it, and so does a click on the backdrop
//   · focus moves in on open and returns to whatever opened it on close
//   · Tab cycles within the dialog rather than escaping behind it
//   · it is announced as a dialog, with its heading as the name
//   · the page behind cannot scroll while it is open

import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";

/** Everything focusable, in document order — the order Tab should follow. */
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]),' +
  'select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  title, description, onClose, children, footer, size = "md",
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;

    // The first field, or the panel itself when there is nothing to type into.
    const first = panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel.current)?.focus();

    // A dialog over a scrolling page that still scrolls behind you is
    // disorienting with a mouse and disastrous with a screen reader.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;

      const items = Array.from(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
        .filter(el => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      // Wrap at both ends, so Tab and Shift+Tab stay inside.
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (active && !panel.current?.contains(active)) { e.preventDefault(); first.focus(); }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      // Back to the button that opened it, so the keyboard does not start again
      // from the top of the page.
      returnTo.current?.focus?.();
    };
  }, [onClose]);

  const width = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10 backdrop-blur-[2px]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`w-full ${width} space-y-3 rounded-3xl border border-[#dbe9fb] bg-white p-6 shadow-[0_24px_70px_rgba(22,51,94,0.24)] focus:outline-none`}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-bold text-stone-800">{title}</h2>
            {description && <p id={descId} className="mt-0.5 text-xs text-stone-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2f5b9c]"
          >
            <X size={16} />
          </button>
        </div>

        {children}

        {footer && <div className="flex gap-2 border-t border-stone-100 pt-3">{footer}</div>}
      </div>
    </div>
  );
}
