"use client";
// One editor for the lists that are just vocabulary.
//
// Document kinds, document sources and organisation kinds were CHECK
// constraints until migration 149, so adding "Audit Report" meant a deploy.
// Nothing in the app branches on their values, which is exactly the test for
// whether a list can be data: standing and council role stay in code because
// office_eligibility and a leave trigger read them, and a value nobody
// recognises would silently mean nothing.
//
// Written once and pointed at a table, because three near-identical editors is
// three places for the next fix to be applied twice and forgotten once.

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Plus, Trash2, Save, EyeOff, Eye } from "lucide-react";

export interface OptionRow {
  key: string;
  label: string;
  plural_label?: string | null;
  description: string;
  sort_order: number;
  active: boolean;
}

/**
 * A label becomes a key: "Audit Report" -> AUDIT_REPORT.
 *
 * Derived rather than typed because the key is the primary key and the target
 * of a foreign key — it is machinery, and asking somebody to invent one is
 * asking them to make a decision they have no basis for. It is set once on
 * creation and never changes, so renaming the label later is free.
 */
const toKey = (label: string) =>
  label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

export function OptionListCard({ table, title, hint, canEdit, hasPlural = false }: {
  table: "document_kinds" | "document_sources" | "organisation_kinds";
  title: string;
  hint: string;
  canEdit: boolean;
  /** organisation_kinds also carries a plural, for filter headings. */
  hasPlural?: boolean;
}) {
  const supabase = createClient();
  const [rows, setRows] = useState<OptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase.from(table).select("*")
      .order("sort_order").order("label");
    if (error) setErr(error.message);
    setRows((data ?? []) as OptionRow[]);
    setLoading(false);
  }, [supabase, table]);

  useEffect(() => { load(); }, [load]);

  const isNew = (k: string) => k.startsWith("new-");
  const patch = (k: string, p: Partial<OptionRow>) =>
    setRows(rs => rs.map(r => r.key === k ? { ...r, ...p } : r));

  function addRow() {
    setRows(rs => [...rs, {
      key: `new-${Date.now()}`, label: "", plural_label: "", description: "",
      sort_order: (rs.reduce((m, r) => Math.max(m, r.sort_order), 0) || 0) + 10,
      active: true,
    }]);
  }

  async function save() {
    const named = rows.filter(r => r.label.trim());
    setErr(""); setSaving(true);
    for (const r of named) {
      const body: Record<string, unknown> = {
        label: r.label.trim(),
        description: r.description?.trim() ?? "",
        sort_order: r.sort_order,
        active: r.active,
      };
      if (hasPlural) body.plural_label = r.plural_label?.trim() || r.label.trim();

      const { error } = isNew(r.key)
        ? await supabase.from(table).insert({ ...body, key: toKey(r.label) })
        : await supabase.from(table).update(body).eq("key", r.key);
      if (error) {
        setErr(error.code === "23505"
          ? `"${r.label.trim()}" is already on the list.`
          : error.message);
        setSaving(false);
        return;
      }
    }
    setSaving(false);
    await load();
  }

  async function remove(r: OptionRow) {
    if (isNew(r.key)) { setRows(rs => rs.filter(x => x.key !== r.key)); return; }
    if (!confirm(`Delete "${r.label}"?`)) return;
    const { error } = await supabase.from(table).delete().eq("key", r.key);
    if (error) {
      // The foreign key is doing its job: something is filed under this.
      // Better to say so than to let it be deleted and strand those rows.
      setErr(error.code === "23503"
        ? `"${r.label}" is in use, so it cannot be deleted. Hide it instead — existing records keep it and it stops being offered.`
        : error.message);
      return;
    }
    await load();
  }

  const inp = "border-2 border-stone-200 rounded-lg px-2 py-1.5 !text-[13px] outline-none focus:border-[#2f5b9c] bg-white";

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <div>
          <span className="font-semibold text-stone-700">{title}</span>
          <p className="text-[11px] font-normal text-stone-400">{hint}</p>
        </div>
        {canEdit && (
          <Button size="sm" variant="secondary" onClick={addRow}>
            <Plus size={13} /> Add
          </Button>
        )}
      </CardHeader>
      <CardBody className="space-y-2">
        {loading ? (
          <p className="text-sm text-stone-400">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-stone-400">Nothing on this list yet.</p>
        ) : rows.map(r => (
          <div key={r.key} className={`flex flex-wrap items-center gap-2 ${r.active ? "" : "opacity-55"}`}>
            <input className={`${inp} w-44`} value={r.label} disabled={!canEdit}
              placeholder="Name" onChange={e => patch(r.key, { label: e.target.value })} />
            {hasPlural && (
              <input className={`${inp} w-40`} value={r.plural_label ?? ""} disabled={!canEdit}
                placeholder="Plural (for headings)"
                onChange={e => patch(r.key, { plural_label: e.target.value })} />
            )}
            <input className={`${inp} min-w-[180px] flex-1`} value={r.description ?? ""} disabled={!canEdit}
              placeholder="What it means" onChange={e => patch(r.key, { description: e.target.value })} />
            <input className={`${inp} w-16`} type="number" value={r.sort_order} disabled={!canEdit}
              title="Order" onChange={e => patch(r.key, { sort_order: Number(e.target.value) || 0 })} />

            {canEdit && (
              <>
                {/* Hiding, not deleting, is the usual answer: records already
                    filed under a value keep it, and it stops being offered. */}
                <button onClick={() => patch(r.key, { active: !r.active })}
                  title={r.active ? "Hide from the pickers" : "Show again"}
                  className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-[#2f5b9c]">
                  {r.active ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
                <button onClick={() => remove(r)} aria-label={`Delete ${r.label}`}
                  className="rounded p-1 text-stone-300 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        ))}

        {err && <p className="text-[12px] font-medium text-red-600" role="alert">{err}</p>}

        {canEdit && rows.length > 0 && (
          <Button size="sm" loading={saving} onClick={save}>
            <Save size={13} /> Save {title.toLowerCase()}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
