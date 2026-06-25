"use client";
import { useState } from "react";
import { fmtHour } from "@/lib/facilities";

const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); // 7am .. 22 (10pm), each cell = that hour's slot

interface HourBlockPickerProps {
  start: number;
  end: number; // half-open: block covers [start, end)
  onChange: (start: number, end: number) => void;
}

// Click-click contiguous hour-range picker — pick the start hour, then the end
// hour (order doesn't matter), rendered as a row of hour blocks rather than a
// pair of free-text time inputs.
export function HourBlockPicker({ start, end, onChange }: HourBlockPickerProps) {
  const [anchor, setAnchor] = useState<number | null>(null);

  function clickHour(h: number) {
    if (anchor === null) {
      setAnchor(h);
      onChange(h, h + 1);
    } else {
      const s = Math.min(anchor, h);
      const e = Math.max(anchor, h) + 1;
      onChange(s, e);
      setAnchor(null);
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-0.5">
        {HOURS.map(h => {
          const inBlock = h >= start && h < end;
          const isAnchor = anchor === h;
          return (
            <button
              key={h}
              type="button"
              onClick={() => clickHour(h)}
              title={`${fmtHour(h)}–${fmtHour(h + 1)}`}
              className={[
                "w-9 h-7 rounded text-[10px] font-medium flex items-center justify-center transition-colors",
                isAnchor ? "bg-amber-400 text-white" :
                inBlock ? "bg-[#4a6da7] text-white" :
                "bg-stone-100 text-stone-500 hover:bg-stone-200",
              ].join(" ")}
            >
              {fmtHour(h)}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-stone-400">
        {anchor === null ? "Click the start hour, then the end hour." : "Now click the end hour."}
        {" "}Selected: {fmtHour(start)}–{fmtHour(end)}
      </p>
    </div>
  );
}
