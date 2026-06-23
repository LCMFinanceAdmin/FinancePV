"use client";
import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, Download, ExternalLink, FileText } from "lucide-react";

function isImage(url: string) { return /\.(jpe?g|png|webp|gif|heic|heif)(\?|$)/i.test(url); }
function isPdf(url: string) { return /\.pdf(\?|$)/i.test(url); }
function fileName(url: string) {
  try { return decodeURIComponent(url.split("/").pop()?.split("?")[0] ?? "file"); } catch { return "file"; }
}

// Full-screen viewer for booking/PV attachments (images + PDFs), with prev/next.
export function AttachmentPreview({ urls, startIndex = 0, onClose }: { urls: string[]; startIndex?: number; onClose: () => void }) {
  const [i, setI] = useState(startIndex);
  const url = urls[i];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI(v => Math.min(urls.length - 1, v + 1));
      if (e.key === "ArrowLeft") setI(v => Math.max(0, v - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [urls.length, onClose]);

  if (!url) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col" onClick={onClose}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-3 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="shrink-0 opacity-70" />
          <span className="text-sm truncate">{fileName(url)}</span>
          {urls.length > 1 && <span className="text-xs opacity-60 shrink-0">{i + 1} / {urls.length}</span>}
        </div>
        <div className="flex items-center gap-1">
          <a href={url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-white/10" title="Open in new tab"><ExternalLink size={16} /></a>
          <a href={url} download className="p-2 rounded-lg hover:bg-white/10" title="Download"><Download size={16} /></a>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10" title="Close"><X size={18} /></button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex items-center justify-center px-4 pb-4 min-h-0" onClick={e => e.stopPropagation()}>
        {urls.length > 1 && (
          <button onClick={() => setI(v => Math.max(0, v - 1))} disabled={i === 0}
            className="p-2 mr-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 shrink-0"><ChevronLeft size={22} /></button>
        )}
        <div className="flex-1 h-full flex items-center justify-center min-w-0">
          {isImage(url) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={fileName(url)} className="max-h-full max-w-full object-contain rounded-lg" />
          ) : isPdf(url) ? (
            <iframe src={url} title={fileName(url)} className="w-full h-full bg-white rounded-lg" />
          ) : (
            <div className="text-center text-white/80">
              <FileText size={40} className="mx-auto mb-2 opacity-60" />
              <p className="text-sm">Preview not available for this file type.</p>
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline mt-1 inline-block">Open in new tab</a>
            </div>
          )}
        </div>
        {urls.length > 1 && (
          <button onClick={() => setI(v => Math.min(urls.length - 1, v + 1))} disabled={i === urls.length - 1}
            className="p-2 ml-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30 shrink-0"><ChevronRight size={22} /></button>
        )}
      </div>
    </div>
  );
}
