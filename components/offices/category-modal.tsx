"use client";
// The kinds of body the church has.
//
// Church Offices, EXCO Portfolios, Deans, Appointed Posts, Committees and
// Project Committees were a CHECK constraint, which meant a synod inventing a
// new kind of body — a task force, a board of trustees, a district council —
// needed a migration. They are rows now, and this is where they are edited.
//
// A category is not cosmetic. It decides which section a post appears under,
// whether posts of that kind seat one person or several, and whether holding
// one is a seat on the EXCO — which is what the verification queues read.

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { Plus, Trash2, Pencil } from "lucide-react";
import type { OfficeCategory } from "@/components/offices/office-modal";

export function CategoryModal({ categories, officeCounts, onClose, onSaved, say }: {
  categories: OfficeCategory[];
  /** How many posts sit in each, so one in use cannot be quietly deleted. */
  officeCounts: Record<string, number>;
  onClose: () => void;
  onSaved: (message: string) => void;
  say: (m: string, ok?: boolean) => void;
}) {
  const supabase = createClient();
  const [editing, setEditing] = useState<OfficeCategory | null>(null);
  const [adding, setAdding] = useState(false);

  if (editing || adding) {
    return (
      <CategoryForm
        category={editing}
        taken={categories.map(c => c.key)}
        onBack={() => { setEditing(null); setAdding(false); }}
        onSaved={onSaved}
      />
    );
  }

  async function remove(cat: OfficeCategory) {
    const n = officeCounts[cat.key] ?? 0;
    if (n > 0) {
      say(`${cat.label} still has ${n} post${n === 1 ? "" : "s"} in it. Move them first.`, false);
      return;
    }
    if (!confirm(`Delete the ${cat.label} category? Nothing is filed under it.`)) return;
    const { error } = await supabase.from("office_categories").delete().eq("key", cat.key);
    if (error) { say(error.message, false); return; }
    onSaved(`${cat.label} deleted`);
  }

  return (
    <Modal
      title="Kinds of post"
      description="The sections the register is organised into. Add one when the church creates a kind of body that does not fit the others."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" onClick={() => setAdding(true)}><Plus size={13} /> Add a kind</Button>
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </>}
    >
      <ul className="divide-y divide-stone-200 rounded-lg border-2 border-stone-800">
        {categories.map(c => {
          const n = officeCounts[c.key] ?? 0;
          return (
            <li key={c.key} className="flex items-start justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
                  {c.label}
                  {c.is_exco && (
                    <span className="rounded-full bg-[#eef4fd] px-1.5 py-0.5 text-[10px] font-semibold text-[#2f5b9c]">
                      EXCO seat
                    </span>
                  )}
                  {c.seats_many && (
                    <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
                      several members
                    </span>
                  )}
                </div>
                <div className="text-xs text-stone-500">{c.description}</div>
                <div className="text-[11px] text-stone-400">
                  {n === 0 ? "No posts" : `${n} post${n === 1 ? "" : "s"}`}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <button onClick={() => setEditing(c)} aria-label={`Edit ${c.label}`}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-[#2f5b9c]">
                  <Pencil size={13} />
                </button>
                <button onClick={() => remove(c)} aria-label={`Delete ${c.label}`}
                  className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-red-600">
                  <Trash2 size={13} />
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function CategoryForm({ category, taken, onBack, onSaved }: {
  category: OfficeCategory | null;
  taken: string[];
  onBack: () => void;
  onSaved: (message: string) => void;
}) {
  const supabase = createClient();
  const [label, setLabel] = useState(category?.label ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [seatsMany, setSeatsMany] = useState(category?.seats_many ?? false);
  const [isExco, setIsExco] = useState(category?.is_exco ?? false);
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 500));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  /**
   * The key is derived from the label and never changes afterwards.
   *
   * offices.kind stores it, so letting it be edited would mean renaming a value
   * every post of that kind holds. The label is what anybody actually reads, and
   * that stays editable.
   */
  const key = category?.key ?? label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_|_$/g, "");

  async function save() {
    if (!label.trim()) { setErr("Give it a name"); return; }
    if (!category && !key) { setErr("That name has no letters or numbers in it"); return; }
    if (!category && taken.includes(key)) { setErr("There is already a kind with that name"); return; }
    setErr(""); setSaving(true);
    const payload = {
      label: label.trim(),
      description: description.trim(),
      seats_many: seatsMany,
      is_exco: isExco,
      sort_order: parseInt(sortOrder, 10) || 500,
    };
    const { error } = category
      ? await supabase.from("office_categories").update(payload).eq("key", category.key)
      : await supabase.from("office_categories").insert({ ...payload, key });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(category ? "Kind updated" : "Kind added");
  }

  return (
    <Modal
      title={category ? `Edit ${category.label}` : "Add a kind of post"}
      description="A section of the register, and how the posts in it behave."
      onClose={onBack}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}>
          <Plus size={13} /> {category ? "Save" : "Add"}
        </Button>
        <Button variant="ghost" onClick={onBack}>Back</Button>
      </>}
    >
      <div>
        <label className={labelClass}>Name *</label>
        <input className={fieldClass} value={label} onChange={e => setLabel(e.target.value)}
          placeholder="e.g. Task Forces, Boards" />
        {!category && key && (
          <p className="mt-1 text-[11px] text-stone-500">Stored as <code>{key}</code>, which cannot be changed later.</p>
        )}
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <input className={fieldClass} value={description} onChange={e => setDescription(e.target.value)}
          placeholder="Shown under the section heading" />
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2f5b9c]"
            checked={seatsMany} onChange={e => setSeatsMany(e.target.checked)} />
          <span>
            Several members serve at once
            <span className="block text-[11px] text-stone-500">
              A committee rather than an office. Posts of this kind will not ask who holds it alone.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-stone-700">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#2f5b9c]"
            checked={isExco} onChange={e => setIsExco(e.target.checked)} />
          <span>
            Holding one is a seat on the EXCO
            <span className="block text-[11px] text-stone-500">
              Say yes only for real EXCO portfolios — it is what makes a holder answerable
              for their ministry&rsquo;s spending.
            </span>
          </span>
        </label>
      </div>

      <div>
        <label className={labelClass}>Order on the page</label>
        <input type="number" className={fieldClass} value={sortOrder}
          onChange={e => setSortOrder(e.target.value)} />
        <p className="mt-1 text-[11px] text-stone-500">Lower numbers come first. The existing sections run 10 to 60.</p>
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
