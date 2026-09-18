"use client";

// How LCM is organised, for somebody who is not part of it.
//
// Deliberately not Settings -> Church Directory. That page edits: it holds ROS
// numbers, leave routing, council contacts and a delete button on every row,
// and it reads `people` directly, which a guest cannot read at all. This shows
// the structure and the names, and has nothing to press.

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Church } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";

interface Row {
  district: string | null;
  congregation: string;
  head_pastor: string | null;
}

export default function ChurchDirectoryPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.rpc("guest_church_directory").then(({ data }) => {
      setRows((data as Row[]) ?? []);
      setLoading(false);
    });
  }, []);

  // Grouped in the browser rather than by the query: the function returns the
  // churches already ordered by district, and a second round trip to learn
  // where the breaks fall would tell us nothing this does not.
  const districts: { name: string; churches: Row[] }[] = [];
  for (const r of rows) {
    const name = r.district ?? "Not yet in a district";
    const last = districts[districts.length - 1];
    if (last && last.name === name) last.churches.push(r);
    else districts.push({ name, churches: [r] });
  }

  return (
    <div className="cloudlight-page max-w-4xl space-y-6">
      <div>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#4f7fc3]">
          The Church
        </p>
        <h1 className="text-xl font-bold text-stone-800">Church Directory</h1>
        <p className="text-sm text-stone-400">
          The Lutheran Church in Malaysia, by district and congregation
        </p>
      </div>

      {loading ? (
        <p className="py-8 text-center text-sm text-stone-400">Loading…</p>
      ) : rows.length === 0 ? (
        <Card>
          <CardBody>
            <p className="text-sm text-stone-500">
              No congregations are recorded yet.
            </p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          {districts.map(d => (
            <Card key={d.name}>
              <CardBody className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-sm font-bold text-stone-800">{d.name}</h2>
                  <span className="shrink-0 text-xs text-stone-400">
                    {d.churches.length} {d.churches.length === 1 ? "church" : "churches"}
                  </span>
                </div>
                <ul className="divide-y divide-stone-100">
                  {d.churches.map(c => (
                    <li key={c.congregation} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-2">
                      <Church size={13} className="shrink-0 text-stone-300" />
                      <span className="text-sm font-medium text-stone-700">{c.congregation}</span>
                      {/* Said rather than left blank: an empty space reads as a
                          page that failed to load, not as a vacancy. */}
                      <span className="text-xs text-stone-400">
                        {c.head_pastor ?? "no head pastor recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <p className="text-xs leading-relaxed text-stone-400">
        Names and structure only. If something here is out of date, the Finance
        Executive or the Administrator keeps these records.
      </p>
    </div>
  );
}
