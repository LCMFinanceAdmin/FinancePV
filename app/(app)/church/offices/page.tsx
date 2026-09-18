"use client";

// Who currently holds each office.
//
// The constitutional offices first — Bishop, Secretary, Treasurer — then the
// EXCO portfolios, which is the order the church itself uses. Current terms
// only: a list of everyone who has ever held an office is a different page and
// belongs with the people who keep the records.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Landmark } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";

interface Row {
  kind: string;
  office: string;
  holder: string;
  since: string | null;
}

const SECTIONS: { kind: string; title: string; blurb: string }[] = [
  {
    kind: "CHURCH",
    title: "Officers of the church",
    blurb: "The constitutional offices. Payment vouchers are signed by these.",
  },
  {
    kind: "EXCO",
    title: "EXCO portfolios",
    blurb: "Each portfolio verifies the spending of its own ministry.",
  },
];

function year(d: string | null) {
  return d ? new Date(d).getFullYear() : null;
}

export default function ElectedOfficesPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("guest_elected_offices").then(({ data }) => {
      setRows((data as Row[]) ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="cloudlight-page max-w-4xl space-y-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">
          The Church
        </p>
        <h1 className="text-xl font-bold text-stone-800">Elected Offices</h1>
        <p className="text-sm text-stone-400">Who holds each office at the moment</p>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-stone-400">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-stone-500">No offices are recorded yet.</p>
          </CardBody>
        </Card>
      ) : (
        SECTIONS.map(section => {
          const held = rows.filter(r => r.kind === section.kind);
          if (held.length === 0) return null;
          return (
            <Card key={section.kind}>
              <CardBody className="space-y-3">
                <div>
                  <h2 className="text-sm font-bold text-stone-800">{section.title}</h2>
                  <p className="text-xs text-stone-400">{section.blurb}</p>
                </div>
                <ul className="divide-y divide-stone-100">
                  {held.map(r => (
                    <li key={r.office} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                      <Landmark size={13} className="shrink-0 text-stone-300" />
                      <span className="min-w-[10rem] text-sm font-medium text-stone-700">
                        {r.office}
                      </span>
                      <span className="text-sm text-stone-600">{r.holder}</span>
                      {year(r.since) && (
                        <span className="text-xs text-stone-400">since {year(r.since)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          );
        })
      )}

      <p className="text-xs leading-relaxed text-stone-400">
        Names and offices only. A vacant office simply does not appear.
      </p>
    </div>
  );
}
