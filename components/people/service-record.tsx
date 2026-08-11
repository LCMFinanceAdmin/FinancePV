"use client";
// What this person has served, and when.
//
// The register answers "who is Bishop". This answers the other question an
// administrator actually asks — "what has Andrew held, and when was he on the
// BAM Committee" — and, read across people, "who was the former Building
// Manager".
//
// It is a reading of office_holdings, not a second store. Terms are numbered
// per office, because "Bishop, second term" is how people say it.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Award, Dot } from "lucide-react";

interface ServiceRow {
  holding_id: string;
  office_name: string;
  office_kind: string;
  is_elected: boolean;
  elected_on: string | null;
  term_start: string;
  term_end: string | null;
  note: string | null;
  is_current: boolean;
  term_number: number;
}

const fmt = (d?: string | null) =>
  d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "";

const ordinal = (n: number) =>
  n === 1 ? "first" : n === 2 ? "second" : n === 3 ? "third" : `${n}th`;

export function ServiceRecord({ personId }: { personId: string }) {
  const supabase = createClient();
  const [rows, setRows] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from("person_service_record")
      .select("*").eq("person_id", personId);
    setRows((data ?? []) as ServiceRow[]);
    setLoading(false);
  }, [supabase, personId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return null;
  if (rows.length === 0) {
    return (
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
          <Award size={13} /> Service record
        </p>
        <p className="rounded-xl border border-dashed border-stone-200 px-3 py-3 text-center text-[13px] text-stone-400">
          No office held yet. Elected and appointed posts are recorded in Offices &amp; Elections.
        </p>
      </div>
    );
  }

  const current = rows.filter(r => r.is_current);
  const past = rows.filter(r => !r.is_current);
  // How many terms in total, so "served three terms" can be said at a glance.
  const totalTerms = rows.length;

  const line = (r: ServiceRow) => (
    <li key={r.holding_id} className="flex items-start gap-2">
      <Dot size={16} className={`mt-0.5 shrink-0 ${r.is_current ? "text-green-500" : "text-stone-300"}`} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <span className="text-[13px] font-semibold text-stone-800">{r.office_name}</span>
          {r.term_number > 1 && (
            <span className="text-[11px] text-stone-400">{ordinal(r.term_number)} term</span>
          )}
          {r.is_current && (
            <span className="rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">
              Current
            </span>
          )}
        </div>
        <p className="text-[12px] text-stone-500">
          {fmt(r.term_start)} – {r.term_end ? fmt(r.term_end) : "present"}
          {r.is_elected ? "" : " · appointed"}
          {r.note ? ` · ${r.note}` : ""}
        </p>
      </div>
    </li>
  );

  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-stone-500">
        <Award size={13} /> Service record
        <span className="font-medium normal-case tracking-normal text-stone-400">
          — {totalTerms} term{totalTerms === 1 ? "" : "s"} in all
        </span>
      </p>
      <div className="rounded-xl border border-stone-100 bg-white p-3">
        {current.length > 0 && <ul className="space-y-1.5">{current.map(line)}</ul>}
        {past.length > 0 && (
          <>
            {current.length > 0 && <div className="my-2 border-t border-stone-100" />}
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">Previously</p>
            <ul className="space-y-1.5">{past.map(line)}</ul>
          </>
        )}
      </div>
    </div>
  );
}
