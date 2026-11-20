"use client";
// A list you can filter, pick from, or type past.
//
// The browser's own <datalist> is the cheap version of this and looks it: an
// unstyled native panel that ignores the form around it, sorts how it likes,
// and on some platforms will not open at all until a character is typed. For
// a list of fifty-two churches that is the difference between picking one and
// hunting for one.
//
// Typing past the list is deliberate and the reason this is not a <select>.
// Some postings are not congregations — a handful of staff serve Orang Asli
// villages that have no congregation record — and a closed list would make
// them pick a church that is not where they serve. So anything may be typed,
// and the caller is told whether what was typed is on the list.

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export function ComboBox({
  value, onChange, options, placeholder, disabled, className, allowFree = true, emptyNote,
}: {
  value: string;
  onChange: (next: string) => void;
  options: readonly string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** False turns it into a picker: what is typed only filters. */
  allowFree?: boolean;
  /** Shown under the list when nothing matches and free text is allowed. */
  emptyNote?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  // The box shows the chosen value until it is being searched, so opening the
  // list does not wipe what is already there.
  const typed = open ? query : value;
  const needle = query.trim().toLowerCase();
  const matches = !open || needle === ""
    ? options
    : options.filter(o => o.toLowerCase().includes(needle));

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  function choose(option: string) {
    onChange(option);
    setOpen(false);
    setQuery("");
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) { setOpen(true); setActive(0); return; }
      setActive(i => {
        const next = e.key === "ArrowDown" ? i + 1 : i - 1;
        return matches.length === 0 ? 0 : (next + matches.length) % matches.length;
      });
      return;
    }
    if (e.key === "Enter" && open && matches[active]) {
      e.preventDefault();
      choose(matches[active]);
      return;
    }
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  const base = "w-full border-2 border-stone-800 rounded-lg pl-3 pr-9 py-2 text-sm outline-none "
    + "focus:border-[#2f5b9c] disabled:bg-stone-100 disabled:text-stone-400";

  return (
    <div ref={wrap} className={`relative ${className ?? ""}`}>
      <input
        role="combobox" aria-expanded={open} aria-controls={listId} aria-autocomplete="list"
        className={base}
        value={typed}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(""); setActive(0); }}
        onChange={e => {
          setQuery(e.target.value);
          setActive(0);
          if (!open) setOpen(true);
          // Free text is the value as it is typed. A picker's typing only
          // filters, and the value changes when something is chosen.
          if (allowFree) onChange(e.target.value);
        }}
        onKeyDown={onKey}
      />
      <button type="button" tabIndex={-1} disabled={disabled}
        aria-label={open ? "Close the list" : "Open the list"}
        onClick={() => { setOpen(o => !o); setQuery(""); setActive(0); }}
        className="absolute inset-y-0 right-0 grid w-9 place-items-center text-stone-400 hover:text-stone-700 disabled:text-stone-300">
        <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div id={listId} role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-stone-200 bg-white py-1 shadow-xl">
          {matches.length === 0 ? (
            <p className="px-3 py-2 text-[12px] leading-snug text-stone-500">
              {emptyNote ?? "Nothing on the list matches."}
            </p>
          ) : matches.map((option, i) => {
            const chosen = option === value;
            return (
              <button key={option} type="button" role="option" aria-selected={chosen}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(option)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
                  i === active ? "bg-[#eef5ff] text-[#173a72]" : "text-stone-700"}`}>
                <Check size={13} className={chosen ? "text-[#2f5b9c]" : "invisible"} />
                <span className="truncate">{option}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
