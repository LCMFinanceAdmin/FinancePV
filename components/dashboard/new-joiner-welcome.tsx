"use client";
// Who has just joined, on everybody's dashboard, for their first month.
//
// A church office hires two or three people a year and the rest of the staff
// find out by bumping into them. The directory has held the answer all along —
// `date_joined` on `people` — but nobody opens a directory to learn something
// they did not know to look for. So it comes to them instead, and then stops:
// a month is long enough for the name to land, and short enough that the
// banner never becomes furniture nobody reads.
//
// There is no dismiss button. The ask was that it stay for the month, and a
// banner each person can clear for themselves is one the newest member of
// staff cannot rely on anybody having seen.

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Avatar, categoryOf } from "@/components/people/ui";
import { PartyPopper, ChevronLeft, ChevronRight } from "lucide-react";
import { welcomeCutoff, firstNameOf } from "@/lib/new-joiners";

export interface NewJoiner {
  id: string;
  full_name: string;
  preferred_name: string | null;
  category: string;
  hq_department: string | null;
  photo_path: string | null;
  date_joined: string;
}

/** What the card says somebody does, from what the directory actually holds. */
export function roleLine(p: Pick<NewJoiner, "category" | "hq_department">): string {
  const cat = categoryOf(p.category)?.one ?? "";
  if (p.hq_department && cat) return `${cat} · ${p.hq_department}`;
  return p.hq_department || cat || "";
}

export function NewJoinerWelcome() {
  const [joiners, setJoiners] = useState<NewJoiner[]>([]);
  const [at, setAt] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.from("people")
      .select("id, full_name, preferred_name, category, hq_department, photo_path, date_joined")
      .eq("status", "ACTIVE")
      .eq("is_employed", true)
      .gte("date_joined", welcomeCutoff())
      .order("date_joined", { ascending: false })
      .then(({ data }) => { if (!cancelled) setJoiners((data ?? []) as NewJoiner[]); });
    return () => { cancelled = true; };
  }, []);

  // One at a time, because two faces side by side is a list, and a list is the
  // directory again. It stops while the pointer is on it, so nobody loses the
  // sentence they were half way through, and it never starts at all for
  // somebody who has asked their system to stop moving things about.
  useEffect(() => {
    if (joiners.length < 2 || paused) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => setAt(i => (i + 1) % joiners.length), 7000);
    return () => clearInterval(t);
  }, [joiners.length, paused]);

  if (joiners.length === 0) return null;

  const person = joiners[Math.min(at, joiners.length - 1)];
  const first = firstNameOf(person);
  const role = roleLine(person);
  const step = (d: number) => setAt(i => (i + d + joiners.length) % joiners.length);

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50 via-amber-50/60 to-white px-4 py-4 sm:px-5"
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div className="shrink-0">
          <Avatar name={person.full_name} photoPath={person.photo_path} size={52} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100/80 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
            <PartyPopper size={11} />
            New to the team
            {joiners.length > 1 && <span className="font-bold">· {at + 1} of {joiners.length}</span>}
          </div>
          <h2 className="truncate text-[15px] font-bold text-stone-800 sm:text-base">
            Welcome to the team, {person.preferred_name || person.full_name}
            {role && <span className="font-semibold text-stone-500"> — {role}</span>}
          </h2>
          <p className="mt-0.5 text-[12.5px] leading-snug text-stone-500">
            We&apos;re glad to have {first} with us. Do say hello when you see them around.
          </p>
        </div>
        {joiners.length > 1 && (
          <div className="flex shrink-0 items-center gap-1 self-center">
            <button type="button" onClick={() => step(-1)} aria-label="Previous"
              className="grid h-6 w-6 place-items-center rounded-full text-amber-700/70 transition-colors hover:bg-amber-100">
              <ChevronLeft size={14} />
            </button>
            <button type="button" onClick={() => step(1)} aria-label="Next"
              className="grid h-6 w-6 place-items-center rounded-full text-amber-700/70 transition-colors hover:bg-amber-100">
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
      {joiners.length > 1 && (
        <div className="mt-2.5 flex items-center gap-1.5 pl-[64px] sm:pl-[68px]">
          {joiners.map((j, i) => (
            <button key={j.id} type="button" onClick={() => setAt(i)}
              aria-label={`Show ${j.full_name}`} aria-current={i === at}
              className={`h-1.5 rounded-full transition-all ${
                i === at ? "w-4 bg-amber-500" : "w-1.5 bg-amber-200 hover:bg-amber-300"}`} />
          ))}
          <Link href="/settings/people"
            className="ml-auto text-[11px] font-semibold text-amber-700/80 hover:text-amber-800">
            Directory →
          </Link>
        </div>
      )}
    </div>
  );
}
