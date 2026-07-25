"use client";
import { useEffect, useState } from "react";

// Renders an HTML document attachment (e.g. a signed worksheet) as a live,
// scaled-down preview thumbnail, and — when clicked — opens the full document
// in a new tab. The file is fetched and rendered via an iframe's srcDoc (and
// opened as a text/html blob) so it displays as a real page no matter what
// Content-Type the storage server reports — including files uploaded before
// the content-type was being set correctly, which are served as text/plain
// and would otherwise show raw source.
export function HtmlAttachmentThumb({ url, label, size = 88 }: { url: string; label?: string; size?: number }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then(r => r.text())
      .then(t => { if (!cancelled) setHtml(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  function open() {
    if (html) {
      const blobUrl = URL.createObjectURL(new Blob([html], { type: "text/html" }));
      window.open(blobUrl, "_blank");
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      window.open(url, "_blank");
    }
  }

  return (
    <button
      type="button"
      onClick={open}
      title={label}
      className="rounded-xl overflow-hidden border border-stone-200 hover:border-[#4a6da7] transition-colors bg-white relative block"
      style={{ width: size, height: size }}
    >
      {html ? (
        <iframe
          srcDoc={html}
          title={label || "attachment"}
          scrolling="no"
          tabIndex={-1}
          className="absolute top-0 left-0 border-0 pointer-events-none origin-top-left"
          style={{ width: "300%", height: "300%", transform: "scale(0.3333)" }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-stone-300 text-xs">…</div>
      )}
    </button>
  );
}
