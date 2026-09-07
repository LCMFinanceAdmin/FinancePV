"use client";
// The voucher itself, beside the record of it.
//
// Finance Activity used to be a list you read and a voucher you opened in
// another tab. Reviewing meant leaving the queue, looking, coming back and
// finding your place again — for every voucher in a run of thirty.
//
// The document shown here is the same HTML the Print and Download buttons
// produce, from pvPrintHtml, rather than a second rendering built for the
// screen. That matters more than it sounds: a reviewer signs off on what they
// saw, and if the preview and the printed voucher were built by different code
// they would eventually disagree about something that mattered. An iframe is
// the cheap way to have one renderer — it also isolates the voucher's own CSS,
// which is written for paper and would otherwise fight the app's stylesheet.
//
// Attachments become tabs beside it, so a supporting document is one click
// away rather than a download.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText, Paperclip, Maximize2, Minimize2, Download, Loader2,
  ZoomIn, ZoomOut, ChevronLeft, ChevronRight,
} from "lucide-react";
import { pvPrintHtml } from "@/components/pv/pv-html";
import { svgToPngDataUri } from "@/lib/svg-to-png";
import type { PV } from "@/lib/types";

const IMAGE_RE = /\.(png|jpe?g|gif|webp|heic|heif)(\?|$)/i;
const PDF_RE = /\.pdf(\?|$)/i;

// The voucher stylesheet caps its sheet at 820px and gives it a 20px margin.
// The frame is laid out at that width whatever the pane is, and scaled — which
// is what zooming a document means. Sizing the frame to the pane instead just
// reflows the sheet, which is what the first version of this did.
const SHEET_W = 880;

/** "…/1712-EPF%20Summary.pdf" → "EPF Summary". */
function attachmentLabel(url: string, i: number): string {
  try {
    const base = decodeURIComponent(url.split("?")[0].split("/").pop() ?? "");
    const name = base.replace(/\.[a-z0-9]+$/i, "").replace(/^\d{6,}[-_]?/, "");
    return name.trim() || `Attachment ${i + 1}`;
  } catch {
    return `Attachment ${i + 1}`;
  }
}

export function PVViewer({
  pv, loading,
}: { pv: PV | null; loading?: boolean }) {
  const [tab, setTab] = useState(0);
  // null means "fit the pane" — the sensible default, because the sheet is
  // wider than the pane at every layout and a document opened already scrolled
  // sideways reads as broken.
  const [zoom, setZoom] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const [paneW, setPaneW] = useState(0);
  const [docH, setDocH] = useState(1123);
  const [logo, setLogo] = useState("");

  const attachments = useMemo(() => (pv?.attachments ?? []).filter(Boolean), [pv]);

  // The church logo, as the printed voucher has it. Loaded once and cheap; the
  // preview claims to be the voucher, so it should not quietly omit the badge
  // at the top of it.
  useEffect(() => { svgToPngDataUri("/lcm-logo.svg", 200).then(setLogo); }, []);

  // Fit-to-width, measured by a callback ref rather than an effect.
  //
  // As an effect it never ran. The component returns early while it is loading
  // and while nothing is selected, so on the mount that the effect fired on
  // there was no scroll container to observe — and by the time one existed the
  // dependencies had not changed, so it never fired again. paneW stayed 0, the
  // fit fell back to 100%, and every voucher opened wider than its pane with
  // scrollbars on two sides. A callback ref runs when the node actually
  // appears, which is the thing being waited for.
  const paneRO = useRef<ResizeObserver | null>(null);
  const attachScroll = useCallback((el: HTMLDivElement | null) => {
    paneRO.current?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPaneW(e.contentRect.width));
    ro.observe(el);
    paneRO.current = ro;
  }, []);

  useEffect(() => () => paneRO.current?.disconnect(), []);

  // Capped at 140 rather than 100: on a wide pane the sheet would otherwise
  // float in the middle of a grey field at its paper size, which wastes exactly
  // the room the pane was widened to provide.
  const fitZoom = paneW > 0 ? Math.min(140, Math.max(25, (paneW / SHEET_W) * 100)) : 100;
  const z = zoom ?? fitZoom;

  // load fires before the logo and any web font have settled, so measuring once
  // there can cut the bottom off a voucher. Watching the document itself is the
  // only version of this that stays right.
  const innerRO = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLIFrameElement | null) => {
    innerRO.current?.disconnect();
    if (!el) return;
    try {
      const d = el.contentDocument;
      if (!d) return;
      const apply = () => setDocH(Math.max(600, d.documentElement.scrollHeight + 8));
      apply();
      const win = el.contentWindow;
      if (win && "ResizeObserver" in win) {
        innerRO.current = new (win as unknown as { ResizeObserver: typeof ResizeObserver })
          .ResizeObserver(apply);
        innerRO.current.observe(d.documentElement);
      }
    } catch {
      // Cross-origin, which srcDoc should never be. Keep the A4 default.
    }
  }, []);

  useEffect(() => () => innerRO.current?.disconnect(), []);

  // Back to the voucher whenever a different PV is chosen: tab 3 of the last
  // one means nothing on this one. Adjusted during render rather than in an
  // effect — an effect would paint the new voucher under the old voucher's tab
  // for a frame first, and React rightly complains about the cascade.
  const [lastId, setLastId] = useState(pv?.id);
  if (pv?.id !== lastId) {
    setLastId(pv?.id);
    setTab(0);
    setZoom(null);
    setDocH(1123);
  }

  // Escape leaves full screen. Without it the only way out is the button,
  // which is off-screen on a small display.
  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full]);

  // Built once per voucher. pvPrintHtml walks the line items and inlines the
  // logo, so it is not something to redo on every zoom click.
  //
  // Attachments are stripped here, and only here. pvPrintHtml appends every one
  // of them to the voucher because that is right for printing — you want the
  // receipts behind the voucher on paper. On screen they are the tabs beside
  // it, and leaving them in meant the first tab contained all the others,
  // inside a frame with its own scrollbar.
  const html = useMemo(
    () => (pv ? pvPrintHtml({ ...pv, attachments: [], payment_receipt_url: "" }, logo) : ""),
    [pv, logo],
  );

  if (loading) {
    return (
      <Shell>
        <div className="flex h-full items-center justify-center gap-2 text-sm text-stone-400">
          <Loader2 size={15} className="animate-spin" /> Opening the voucher…
        </div>
      </Shell>
    );
  }

  if (!pv) {
    return (
      <Shell>
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
          <FileText size={26} className="text-stone-200" />
          <p className="text-sm font-medium text-stone-400">No voucher selected</p>
          <p className="max-w-[15rem] text-xs text-stone-400">
            Choose one from the list and it opens here, exactly as it prints.
          </p>
        </div>
      </Shell>
    );
  }

  const current = tab === 0 ? null : attachments[tab - 1];

  return (
    <div className={full
      ? "fixed inset-0 z-50 flex flex-col bg-white"
      : "flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e3edf9] bg-white"}>

      {/* ── Which document ─────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-[#e3edf9] bg-[#fafcff] px-2">
        <ViewerTab active={tab === 0} onClick={() => setTab(0)} icon={<FileText size={13} />}>
          Payment Voucher
        </ViewerTab>
        {attachments.map((url, i) => (
          <ViewerTab key={url} active={tab === i + 1} onClick={() => setTab(i + 1)}
            icon={<Paperclip size={13} />}>
            {attachmentLabel(url, i)}
          </ViewerTab>
        ))}
        <div className="ml-auto flex items-center gap-1 pl-2">
          <button onClick={() => setFull(f => !f)} title={full ? "Exit full screen (Esc)" : "Full screen"}
            className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-white hover:text-stone-700">
            {full ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
        </div>
      </div>

      {/* ── Zoom and paging ────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-2 border-b border-[#eef4fc] px-2 py-1">
        {attachments.length > 0 && (
          <div className="flex items-center gap-0.5">
            <button onClick={() => setTab(t => Math.max(0, t - 1))} disabled={tab === 0}
              title="Previous document"
              className="rounded p-1 text-stone-400 hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30">
              <ChevronLeft size={14} />
            </button>
            <span className="min-w-[3rem] text-center text-[11px] tabular-nums text-stone-500">
              {tab + 1} / {attachments.length + 1}
            </span>
            <button onClick={() => setTab(t => Math.min(attachments.length, t + 1))}
              disabled={tab === attachments.length} title="Next document"
              className="rounded p-1 text-stone-400 hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30">
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          <button onClick={() => setZoom(Math.max(25, Math.round(z) - 10))} disabled={z <= 25} title="Zoom out"
            className="rounded p-1 text-stone-400 hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30">
            <ZoomOut size={14} />
          </button>
          <button onClick={() => setZoom(null)} title="Fit to width"
            className="min-w-[3.5rem] rounded px-1 py-0.5 text-[11px] font-semibold tabular-nums text-stone-600 hover:bg-stone-50">
            {Math.round(z)}%{zoom === null ? "" : "\u00b7"}
          </button>
          <button onClick={() => setZoom(Math.min(250, Math.round(z) + 10))} disabled={z >= 250} title="Zoom in"
            className="rounded p-1 text-stone-400 hover:bg-stone-50 hover:text-stone-700 disabled:opacity-30">
            <ZoomIn size={14} />
          </button>
          {current && (
            <a href={current} target="_blank" rel="noopener noreferrer" title="Open this attachment"
              className="ml-1 rounded p-1 text-stone-400 hover:bg-stone-50 hover:text-stone-700">
              <Download size={14} />
            </a>
          )}
        </div>
      </div>

      {/* ── The document ───────────────────────────────────────── */}
      <div ref={attachScroll} className="min-h-0 flex-1 overflow-auto bg-[#f2f5fa] p-2">
        <div style={tab === 0
          ? { width: SHEET_W * (z / 100), height: docH * (z / 100), margin: "0 auto" }
          : { width: `${z}%`, margin: "0 auto" }}>
          {tab === 0 ? (
            <iframe
              title={`Payment voucher ${pv.pv_no}`}
              srcDoc={html}
              // allow-same-origin and nothing else: the frame is measured after
              // it loads so the whole voucher scrolls in the pane rather than
              // in a nested scrollbar, and that needs to read its own document.
              // No allow-scripts, so there is nothing in there that can run.
              sandbox="allow-same-origin"
              onLoad={e => measure(e.currentTarget)}
              style={{
                width: SHEET_W, height: docH,
                transform: `scale(${z / 100})`, transformOrigin: "top left",
                border: 0,
              }}
              className="rounded-lg bg-white shadow-sm"
            />
          ) : current && IMAGE_RE.test(current) ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={current} alt={attachmentLabel(current, tab - 1)}
              className="w-full rounded-lg border border-stone-200 bg-white shadow-sm" />
          ) : current && PDF_RE.test(current) ? (
            <iframe title={attachmentLabel(current, tab - 1)} src={current}
              className="h-[1123px] w-full rounded-lg border border-stone-200 bg-white shadow-sm" />
          ) : (
            <div className="rounded-lg border border-stone-200 bg-white p-8 text-center">
              <Paperclip size={22} className="mx-auto mb-2 text-stone-300" />
              <p className="text-sm text-stone-500">This attachment can&rsquo;t be shown here.</p>
              <a href={current ?? "#"} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-medium text-[#3d5a8f] hover:underline">
                Open it in a new tab
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#e3edf9] bg-white">
      {children}
    </div>
  );
}

function ViewerTab({ active, onClick, icon, children }: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
        active
          ? "border-[#4a6da7] text-[#3d5a8f]"
          : "border-transparent text-stone-500 hover:text-stone-700"}`}>
      {icon}{children}
    </button>
  );
}
