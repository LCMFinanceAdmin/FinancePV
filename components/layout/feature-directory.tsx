"use client";
// Every function this person can reach, laid out as a map.
//
// The sidebar is for getting somewhere you already know about. This is for the
// other case — "the app does something like this, where is it?" — which is why
// each entry carries a line saying what the page is for rather than just its
// name. It reads from the same nav model as the sidebar, so nothing can appear
// in one and be missing from the other.

import { useState } from "react";
import Link from "next/link";
import { visibleGroups } from "@/lib/nav";
import type { UserProfile } from "@/lib/types";
import { Search, ArrowRight } from "lucide-react";

export function FeatureDirectory({ user }: { user: UserProfile }) {
  const [q, setQ] = useState("");
  const groups = visibleGroups(user);

  const filter = q.trim().toLowerCase();
  const shown = filter
    ? groups
        .map(g => ({
          ...g,
          items: g.items.filter(i =>
            i.label.toLowerCase().includes(filter) ||
            i.desc.toLowerCase().includes(filter) ||
            g.label.toLowerCase().includes(filter)),
        }))
        .filter(g => g.items.length > 0)
    : groups;

  const total = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-stone-400">All Features</div>
          <p className="mt-0.5 text-xs text-stone-400">
            Everything you can access — {total} in {groups.length} areas
          </p>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-300" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Find a feature…"
            className="w-full rounded-xl border border-stone-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#4a6da7]"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-stone-400">
          Nothing matches &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {shown.map(g => (
            <div key={g.id} className="rounded-2xl border border-stone-100 bg-white p-4 shadow-sm">
              <div className="mb-2.5 flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl"
                  style={{ backgroundColor: `${g.accent}1a`, color: g.accent }}>
                  {g.icon}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-bold text-stone-800">{g.label}</div>
                  <div className="truncate text-[11px] text-stone-400">{g.desc}</div>
                </div>
              </div>
              <div className="space-y-0.5">
                {g.items.map(i => (
                  <Link key={i.href} href={i.href}
                    className="group flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[#f4f9ff]">
                    <span className="mt-0.5 shrink-0 text-stone-300 group-hover:text-[#4a6da7]">{i.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] font-medium text-stone-700">{i.label}</span>
                      <span className="block text-[11px] leading-snug text-stone-400">{i.desc}</span>
                    </span>
                    <ArrowRight size={13} className="mt-1 shrink-0 text-transparent group-hover:text-[#4a6da7]" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
