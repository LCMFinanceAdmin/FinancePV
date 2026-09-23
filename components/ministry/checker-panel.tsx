"use client";
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { PersonPicker, type PickablePerson } from "@/components/ui/person-picker";
import { Search } from "lucide-react";
import { isHqOffice } from "@/lib/ministries";

/**
 * Who checks this ministry's vouchers.
 *
 * One standing appointment per ministry, made by the EXCO Member who holds it.
 * The person named checks that the particulars and amounts on a voucher are
 * right; the EXCO Member still verifies it afterwards, because whether the
 * church should pay is a different question and remains theirs.
 *
 * Appointing somebody does not put every voucher through them. The EXCO
 * decides that voucher by voucher — this only says who to send it to when they
 * want one checked.
 */
export function CheckerPanel({ ministries }: { ministries: string[] }) {
  const supabase = createClient();
  const [people, setPeople] = useState<PickablePerson[]>([]);
  const [rows, setRows] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [msg, setMsg] = useState("");

  // HQ has no EXCO to appoint anyone, so it has nothing to show here.
  const mine = ministries.filter(m => !isHqOffice(m));

  const load = useCallback(async () => {
    if (!mine.length) return;
    const [{ data: min }, { data: dir }] = await Promise.all([
      supabase.from("ministries").select("name,checker_email").in("name", mine),
      supabase.from("user_roles").select("email,full_name").order("full_name"),
    ]);
    const next: Record<string, string> = {};
    for (const m of min ?? []) next[m.name] = m.checker_email ?? "";
    setRows(next);
    setPeople((dir ?? []) as PickablePerson[]);
  }, [supabase, mine.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  async function save(ministry: string, email: string) {
    setSaving(ministry);
    try {
      const chosen = people.find(p => p.email === email);
      // .select() and then count the rows. A policy that refuses this write
      // returns no error at all, so a save that never happened would otherwise
      // report success — the same silence that lost a morning of ROS numbers.
      const { data, error } = await supabase.from("ministries")
        .update({ checker_email: email || null, checker_name: chosen?.full_name ?? null })
        .eq("name", ministry)
        .select("name");
      if (error) throw error;
      if (!data?.length) throw new Error("REFUSED — you do not have permission to change this ministry's checker.");
      setRows(r => ({ ...r, [ministry]: email }));
      setMsg(email ? `Appointed for ${ministry}` : `Appointment cleared for ${ministry}`);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving("");
      setTimeout(() => setMsg(""), 5000);
    }
  }

  if (!mine.length) return null;

  return (
    <div className="bg-white rounded-2xl border border-stone-200 p-5 mt-5">
      <div className="flex items-center gap-2 mb-1">
        <Search size={16} className="text-[#4a6da7]" />
        <h2 className="text-sm font-bold text-stone-700">Who checks the particulars</h2>
      </div>
      <p className="text-xs text-stone-400 mb-4">
        The person you appoint checks that the details and amounts on a voucher are
        correct. You still verify it afterwards. Appointing somebody does not send
        every voucher to them — you choose, voucher by voucher.
      </p>

      <div className="space-y-3">
        {mine.map(m => (
          <div key={m} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="text-sm font-medium text-stone-700 sm:w-56 shrink-0">{m}</div>
            <div className="flex-1 min-w-0">
              <PersonPicker
                people={people}
                value={rows[m] ?? ""}
                onChange={email => setRows(r => ({ ...r, [m]: email }))}
                emptyLabel="Nobody appointed"
                placeholder="Type a name…"
              />
            </div>
            <Button size="sm" variant="secondary" loading={saving === m}
              onClick={() => save(m, rows[m] ?? "")}>
              Save
            </Button>
          </div>
        ))}
      </div>

      {msg && <p className="text-xs mt-3 text-stone-500">{msg}</p>}
    </div>
  );
}
