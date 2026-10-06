"use client";
// The receipts, laid out so they can be looked at rather than listed.
//
// Shared because the same grid existed twice: an image shows as a thumbnail, a
// file as its name, and both open in a new tab. Each page keeps its own toggle
// — on one it sits in a row of buttons, on the other under the amount — but
// what is inside the panel is one piece of markup.

import { Paperclip, FileText, ExternalLink } from "lucide-react";

const isImage = (url: string) => /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);

export function PVAttachments({ urls, className = "" }: { urls: string[]; className?: string }) {
  if (urls.length === 0) return null;
  return (
    <div className={className}>
      <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-stone-500">
        <Paperclip size={11} /> Supporting Documents ({urls.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="group relative block">
            {isImage(url) ? (
              <div className="h-24 w-24 overflow-hidden rounded-lg border border-stone-200 transition-colors hover:border-[#4a6da7]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Attachment ${i + 1}`}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 transition-colors hover:border-[#4a6da7]">
                <FileText size={16} className="text-stone-400" />
                <span className="max-w-[100px] truncate text-xs text-stone-600">
                  {url.split("/").pop() ?? `File ${i + 1}`}
                </span>
                <ExternalLink size={10} className="shrink-0 text-stone-400" />
              </div>
            )}
          </a>
        ))}
      </div>
    </div>
  );
}
