"use client";
import { useState, useRef, useEffect } from "react";
import { ChevronDown, Plus, Trash2, Check } from "lucide-react";

// A styled Committee / District / Personal picker with search, a type-to-add
// row, and per-item delete for the custom (GM-added) entries. Standard LCM
// ministries are passed in as `standard` and can't be deleted; anything the GM
// adds lives in `custom` and shows a remove (×) on hover.
export function CommitteePicker({
  value, onChange, standard, custom = [], onAdd, onDelete, placeholder = "Committee / District…", size = "sm",
}: {
  value: string;
  onChange: (v: string) => void;
  standard: string[];
  custom?: { id: string; name: string; meta?: string }[];
  onAdd?: (name: string) => Promise<void> | void;
  onDelete?: (id: string) => Promise<void> | void;
  placeholder?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const allNames = [...standard, ...custom.map(c => c.name)];
  const filter = q.trim().toLowerCase();
  const stdShown = standard.filter(s => s.toLowerCase().includes(filter));
  const custShown = custom.filter(c => c.name.toLowerCase().includes(filter));
  const exact = allNames.some(n => n.toLowerCase() === filter);
  const canAdd = filter.length > 0 && !exact;

  async function add() {
    const name = q.trim();
    if (!name) return;
    setBusy(true);
    try { if (onAdd) await onAdd(name); onChange(name); setQ(""); setOpen(false); }
    finally { setBusy(false); }
  }

  const btnCls = size === "sm"
    ? "border border-stone-300 rounded px-1.5 py-1 text-[13px]"
    : "border border-stone-200 rounded-xl px-3 py-2.5 text-sm";

  // Entries are often paths ("ECP Public Bank - Monthly Recurring / Utilities").
  // Truncating those made every option in a folder read identically, so the
  // parent is dimmed and the leaf carries the weight — the part that actually
  // distinguishes one option from the next.
  const PathLabel = ({ name }: { name: string }) => {
    const parts = name.split(" / ");
    const leaf = parts.pop() ?? name;
    return (
      <span className="min-w-0 break-words">
        {parts.length > 0 && (
          <span className="text-stone-400">{parts.join(" / ")} / </span>
        )}
        <span className="font-medium text-stone-700">{leaf}</span>
      </span>
    );
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        title={value || placeholder}
        className={`${btnCls} w-full bg-white flex items-center justify-between gap-1 text-left transition-colors hover:border-[#4a6da7]/60 focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/40 ${value ? "text-stone-800" : "text-stone-400"}`}>
        <span className="truncate">{value || placeholder}</span>
        <ChevronDown size={14} className={`text-stone-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* The dropdown is wider than the trigger when it needs to be: folder
          paths are long, and one that clips them is no use for choosing
          between them. */}
      {open && (
        <div className="absolute z-30 mt-1 w-max min-w-full max-w-[min(30rem,88vw)] bg-white border border-stone-200 rounded-xl shadow-xl overflow-hidden">
          <div className="p-2 border-b border-stone-100">
            <input autoFocus value={q} onChange={e => setQ(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && canAdd) { e.preventDefault(); add(); } if (e.key === "Escape") setOpen(false); }}
              placeholder="Search or type a new one…"
              className="w-full border-2 border-stone-800 rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:ring-1 focus:ring-[#4a6da7]/40" />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {canAdd && (
              <button type="button" onClick={add} disabled={busy}
                className="w-full flex items-center gap-1.5 px-3 py-2 text-[13px] text-[#4a6da7] font-semibold hover:bg-blue-50 text-left disabled:opacity-50">
                <Plus size={13} /> Add &ldquo;{q.trim()}&rdquo;
              </button>
            )}
            {stdShown.map(s => (
              <button key={s} type="button" title={s} onClick={() => { onChange(s); setOpen(false); }}
                className="w-full flex items-start gap-1.5 px-3 py-1.5 text-[13px] hover:bg-stone-50 text-left">
                {value === s ? <Check size={12} className="mt-0.5 text-green-600 shrink-0" /> : <span className="w-3 shrink-0" />}
                <PathLabel name={s} />
              </button>
            ))}
            {custShown.length > 0 && stdShown.length > 0 && (
              <div className="my-1 border-t border-stone-100">
                <div className="px-3 pt-1 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-stone-300">Added by you</div>
              </div>
            )}
            {custShown.map(c => (
              <div key={c.id} className="flex items-start gap-1 px-3 py-1.5 text-[13px] hover:bg-stone-50">
                <button type="button" title={c.name} onClick={() => { onChange(c.name); setOpen(false); }}
                  className="flex items-start gap-1.5 flex-1 min-w-0 text-left">
                  {value === c.name ? <Check size={12} className="text-green-600 shrink-0 mt-0.5" /> : <span className="w-3 shrink-0" />}
                  <span className="min-w-0">
                    <span className="block"><PathLabel name={c.name} /></span>
                    {c.meta && <span className="block text-[11px] text-stone-400 break-words">{c.meta}</span>}
                  </span>
                </button>
                {onDelete && (
                  <button type="button" title={`Remove "${c.name}" from the list`}
                    onClick={(e) => { e.stopPropagation(); onDelete(c.id); }}
                    className="text-stone-400 hover:text-red-500 hover:bg-red-50 rounded p-0.5 shrink-0 transition-colors">
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            {stdShown.length === 0 && custShown.length === 0 && !canAdd && (
              <div className="px-3 py-2 text-[12px] text-stone-400">No matches — type to add a new one.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
