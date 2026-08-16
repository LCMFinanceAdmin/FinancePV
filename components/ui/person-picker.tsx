"use client";
// Choosing a person by typing rather than scrolling.
//
// A <select> and a scrolling tick-list are both fine at a dozen accounts and
// unusable at fifty, and on a phone the list is already the worst part of the
// form — five names visible, the rest behind a scroll inside a scroll.
//
// Both shapes live here because they are the same problem: filter as you type,
// match on name or address, and keep the keyboard working. The only difference
// is whether picking one closes the list.

import { useState, useRef, useMemo, useEffect } from "react";
import { fieldClass } from "@/lib/field-styles";
import { Search, X, Check } from "lucide-react";

export interface PickablePerson { email: string; full_name: string | null }

/** Name if we have one, address otherwise — never an empty row. */
export const displayName = (p: PickablePerson) => p.full_name?.trim() || p.email;

/** Matches on either, so "eddie" and "eddie.kwan@" both find the same person. */
function matches(p: PickablePerson, q: string) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return displayName(p).toLowerCase().includes(needle)
    || p.email.toLowerCase().includes(needle);
}

/**
 * One person, or nobody.
 *
 * `emptyLabel` is the choice that means "no one in particular" — on a task,
 * "Me". It is a real option rather than a blank, because leaving a picker empty
 * and choosing yourself deliberately look identical otherwise.
 */
export function PersonPicker({ people, value, onChange, emptyLabel = "Nobody", placeholder = "Type a name…" }: {
  people: PickablePerson[];
  value: string;
  onChange: (email: string) => void;
  emptyLabel?: string;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const chosen = people.find(p => p.email === value);
  const results = useMemo(() => people.filter(p => matches(p, query)), [people, query]);

  // Clicking anywhere else closes it — on a phone there is no Escape key.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  function pick(email: string) {
    onChange(email);
    setQuery(""); setOpen(false); setActive(0);
  }

  return (
    <div ref={boxRef} className="relative">
      {!open ? (
        // Closed, it reads as what it is: the current choice, and a way in.
        <button type="button" onClick={() => { setOpen(true); setActive(0); }}
          className={`${fieldClass} flex items-center justify-between text-left`}>
          <span className={chosen ? "text-stone-800" : "text-stone-500"}>
            {chosen ? displayName(chosen) : emptyLabel}
          </span>
          <Search size={13} className="shrink-0 text-stone-400" />
        </button>
      ) : (
        <input
          autoFocus className={fieldClass} value={query} placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={e => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length)); }
            if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
            if (e.key === "Escape")    { setOpen(false); setQuery(""); }
            if (e.key === "Enter") {
              e.preventDefault();
              if (active === 0) pick("");
              else if (results[active - 1]) pick(results[active - 1].email);
            }
          }} />
      )}

      {open && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border-2 border-stone-800 bg-white shadow-lg">
          <li>
            {/* onMouseDown, not onClick: the input blurs first and the list
                would be gone before a click landed. */}
            <button type="button" onMouseDown={e => { e.preventDefault(); pick(""); }}
              className={`flex w-full items-center justify-between px-3 py-2 text-left text-[13px] ${
                active === 0 ? "bg-[#eef4fd]" : "hover:bg-stone-50"}`}>
              <span className="text-stone-600">{emptyLabel}</span>
              {!value && <Check size={13} className="text-[#2f5b9c]" />}
            </button>
          </li>
          {results.length === 0 ? (
            <li className="px-3 py-2 text-[12px] text-stone-400">Nobody matches that.</li>
          ) : results.map((p, i) => (
            <li key={p.email}>
              <button type="button" onMouseDown={e => { e.preventDefault(); pick(p.email); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left ${
                  active === i + 1 ? "bg-[#eef4fd]" : "hover:bg-stone-50"}`}>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] text-stone-800">{displayName(p)}</span>
                  {p.full_name && (
                    <span className="block truncate text-[11px] text-stone-400">{p.email}</span>
                  )}
                </span>
                {value === p.email && <Check size={13} className="shrink-0 text-[#2f5b9c]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Several people.
 *
 * Chosen names sit above the search as removable chips, so the answer to "who
 * did I pick" never requires scrolling back through the list to look for ticks.
 */
export function PeoplePicker({ people, value, onChange, placeholder = "Search by name…" }: {
  people: PickablePerson[];
  value: string[];
  onChange: (emails: string[]) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => people.filter(p => matches(p, query)), [people, query]);
  const chosen = people.filter(p => value.includes(p.email));

  const toggle = (email: string) =>
    onChange(value.includes(email) ? value.filter(e => e !== email) : [...value, email]);

  return (
    <div className="space-y-1.5">
      {chosen.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {chosen.map(p => (
            <li key={p.email}>
              <button type="button" onClick={() => toggle(p.email)}
                aria-label={`Remove ${displayName(p)}`}
                className="inline-flex items-center gap-1 rounded-full bg-[#eef4fd] px-2 py-0.5 text-[11px] font-medium text-[#2f5b9c] hover:bg-[#dbe9fb]">
                {displayName(p)} <X size={10} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
        <input className={`${fieldClass} pl-8`} value={query} placeholder={placeholder}
          onChange={e => setQuery(e.target.value)} />
      </div>

      <ul className="max-h-36 space-y-0.5 overflow-y-auto rounded-lg border-2 border-stone-800 p-1.5">
        {results.length === 0 ? (
          <li className="px-1 py-1 text-[11px] text-stone-400">
            {people.length === 0 ? "Nobody else has an account yet." : "Nobody matches that."}
          </li>
        ) : results.map(p => (
          <li key={p.email}>
            <label className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[12px] text-stone-700 hover:bg-stone-50">
              <input type="checkbox" className="h-3.5 w-3.5 shrink-0 accent-[#2f5b9c]"
                checked={value.includes(p.email)} onChange={() => toggle(p.email)} />
              <span className="truncate">{displayName(p)}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
