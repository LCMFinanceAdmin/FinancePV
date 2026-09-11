// "There are more of these below."
//
// The queue scrolls inside the main pane rather than the window, so it gets no
// browser scrollbar of its own at the edge of the screen — and with the cards
// now tall enough that two of them fill a laptop, a signatory who approves the
// two they can see has no way of knowing a third was ever there. Nothing on
// the page said so.
//
// A count rather than a bare arrow, because "2 more below" answers the
// question an arrow only raises. It hides itself the moment there is nothing
// left underneath, so it never becomes furniture.

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Walks up to whatever is actually doing the scrolling. */
function scrollerFor(node: HTMLElement | null): HTMLElement | null {
  for (let el = node?.parentElement ?? null; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) return el;
  }
  return null;
}

export function ScrollMoreHint({
  listSelector,
  noun = "more",
}: {
  /** The list whose direct children are counted. */
  listSelector: string;
  /** Read as "3 more vouchers below". */
  noun?: string;
}) {
  const anchor = useRef<HTMLSpanElement | null>(null);
  const scroller = useRef<HTMLElement | null>(null);
  const [below, setBelow] = useState(0);

  const measure = useCallback(() => {
    const list = document.querySelector(listSelector);
    const sc = scroller.current;
    if (!list || !sc) { setBelow(0); return; }

    // The fold is the bottom of the scrolling pane, not of the window: on a
    // phone the nav bar covers the last stripe of it.
    const fold = sc.getBoundingClientRect().bottom - 24;
    let n = 0;
    for (const child of Array.from(list.children)) {
      // A row counts as below only once its top edge is past the fold. A row
      // half in view has already announced itself.
      if (child.getBoundingClientRect().top > fold) n++;
    }
    setBelow(n);
  }, [listSelector]);

  useEffect(() => {
    scroller.current = scrollerFor(anchor.current);
    const sc = scroller.current;
    if (!sc) return;

    measure();
    sc.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);

    // The count changes when the list does — a tab switch, a search, a card
    // approved and dropped from the queue — not only when someone scrolls.
    const list = document.querySelector(listSelector);
    const ro = new ResizeObserver(measure);
    const mo = new MutationObserver(measure);
    if (list) { ro.observe(list); mo.observe(list, { childList: true, subtree: true }); }

    return () => {
      sc.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure, listSelector]);

  const jump = () => {
    const sc = scroller.current;
    if (!sc) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sc.scrollBy({ top: sc.clientHeight * 0.85, behavior: reduced ? "auto" : "smooth" });
  };

  return (
    <>
      <span ref={anchor} aria-hidden className="hidden" />
      {below > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom)+0.5rem)] z-30 flex justify-center px-4 print:hidden md:bottom-6">
          <button
            type="button"
            onClick={jump}
            className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-[#dbe9fb] bg-white/95 py-1.5 pl-3.5 pr-3 text-[12px] font-semibold text-[#2f5b9c] shadow-[0_6px_20px_rgba(41,87,149,.18)] backdrop-blur transition-colors hover:bg-white hover:text-[#1e4f95]"
          >
            {below} {noun} below
            <ChevronDown size={14} className="motion-safe:animate-bounce" />
          </button>
        </div>
      )}
    </>
  );
}
