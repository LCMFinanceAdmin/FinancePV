"use client";
import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Plus, Trash2, Save } from "lucide-react";

interface Dept { id: string; name: string; head_name: string; head_email: string; }
interface Ministry { id: string; name: string; }
interface Project { id: string; name: string; code: string; ministry: string; }

export default function LookupsPage() {
  const supabase = createClient();
  const [depts, setDepts] = useState<Dept[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [projectMinFilter, setProjectMinFilter] = useState("ALL");

  useEffect(() => {
    Promise.all([
      supabase.from("departments").select("*").order("name"),
      supabase.from("ministries").select("*").order("name"),
      supabase.from("projects").select("*").order("name"),
    ]).then(([d, m, p]) => {
      setDepts(d.data ?? []);
      setMinistries(m.data ?? []);
      setProjects(p.data ?? []);
      setLoading(false);
    });
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  }

  // Departments
  async function saveDept(dept: Dept) {
    setSaving(true);
    if (dept.id.startsWith("new-")) {
      const { error } = await supabase.from("departments").insert({ name: dept.name, head_name: dept.head_name, head_email: dept.head_email });
      if (!error) showToast("Department saved");
    } else {
      await supabase.from("departments").update({ name: dept.name, head_name: dept.head_name, head_email: dept.head_email }).eq("id", dept.id);
      showToast("Updated");
    }
    const { data } = await supabase.from("departments").select("*").order("name");
    setDepts(data ?? []);
    setSaving(false);
  }

  async function deleteDept(id: string) {
    if (id.startsWith("new-")) { setDepts(d => d.filter(x => x.id !== id)); return; }
    await supabase.from("departments").delete().eq("id", id);
    setDepts(d => d.filter(x => x.id !== id));
    showToast("Deleted");
  }

  // Ministries
  async function saveMinistry(m: Ministry) {
    setSaving(true);
    if (m.id.startsWith("new-")) {
      await supabase.from("ministries").insert({ name: m.name });
    } else {
      await supabase.from("ministries").update({ name: m.name }).eq("id", m.id);
    }
    const { data } = await supabase.from("ministries").select("*").order("name");
    setMinistries(data ?? []);
    setSaving(false);
    showToast("Saved");
  }

  async function deleteMinistry(id: string) {
    if (id.startsWith("new-")) { setMinistries(m => m.filter(x => x.id !== id)); return; }
    await supabase.from("ministries").delete().eq("id", id);
    setMinistries(m => m.filter(x => x.id !== id));
    showToast("Deleted");
  }

  // Projects
  async function saveProject(p: Project) {
    setSaving(true);
    if (p.id.startsWith("new-")) {
      await supabase.from("projects").insert({ name: p.name, code: p.code, ministry: p.ministry });
    } else {
      await supabase.from("projects").update({ name: p.name, code: p.code, ministry: p.ministry }).eq("id", p.id);
    }
    const { data } = await supabase.from("projects").select("*").order("name");
    setProjects(data ?? []);
    setSaving(false);
    showToast("Saved");
  }

  async function deleteProject(id: string) {
    if (id.startsWith("new-")) { setProjects(p => p.filter(x => x.id !== id)); return; }
    await supabase.from("projects").delete().eq("id", id);
    setProjects(p => p.filter(x => x.id !== id));
    showToast("Deleted");
  }

  if (loading) return <div className="p-8 text-center text-stone-400 text-sm">Loading…</div>;

  return (
    <div className="p-5 max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-bold text-stone-800">Lookups Management</h1>

      {toast && (
        <div className="fixed top-4 right-4 z-50 px-4 py-3 bg-green-600 text-white rounded-xl text-sm shadow-lg">{toast}</div>
      )}

      {/* Departments */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <span className="font-semibold text-stone-700">Departments</span>
          <Button size="sm" variant="secondary" onClick={() => setDepts(d => [...d, { id: `new-${Date.now()}`, name: "", head_name: "", head_email: "" }])}>
            <Plus size={13} /> Add
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {depts.map((dept) => (
            <DeptRow key={dept.id} dept={dept}
              onChange={(d) => setDepts(ds => ds.map(x => x.id === d.id ? d : x))}
              onSave={() => saveDept(dept)}
              onDelete={() => deleteDept(dept.id)}
              saving={saving}
            />
          ))}
          {depts.length === 0 && <p className="text-sm text-stone-400">No departments yet</p>}
        </CardBody>
      </Card>

      {/* Ministries */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <span className="font-semibold text-stone-700">Ministries</span>
          <Button size="sm" variant="secondary" onClick={() => setMinistries(m => [...m, { id: `new-${Date.now()}`, name: "" }])}>
            <Plus size={13} /> Add
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          {ministries.map((m) => (
            <div key={m.id} className="flex gap-2 items-center">
              <input className={inp} value={m.name} placeholder="Ministry name"
                onChange={(e) => setMinistries(ms => ms.map(x => x.id === m.id ? { ...x, name: e.target.value } : x))} />
              <Button size="sm" variant="secondary" loading={saving} onClick={() => saveMinistry(m)}><Save size={13} /></Button>
              <Button size="sm" variant="ghost" onClick={() => deleteMinistry(m.id)}><Trash2 size={13} className="text-red-400" /></Button>
            </div>
          ))}
          {ministries.length === 0 && <p className="text-sm text-stone-400">No ministries yet</p>}
        </CardBody>
      </Card>

      {/* Projects */}
      <Card>
        <CardHeader className="flex justify-between items-center">
          <span className="font-semibold text-stone-700">Projects / Budget Codes</span>
          <div className="flex gap-2 items-center">
            <select className={`${inp} w-auto`} value={projectMinFilter} onChange={e => setProjectMinFilter(e.target.value)}>
              <option value="ALL">All Ministries</option>
              {ministries.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
            </select>
            <Button size="sm" variant="secondary" onClick={() => setProjects(p => [...p, { id: `new-${Date.now()}`, name: "", code: "", ministry: projectMinFilter === "ALL" ? "" : projectMinFilter }])}>
              <Plus size={13} /> Add
            </Button>
          </div>
        </CardHeader>
        <CardBody className="space-y-2">
          {projects.filter(p => projectMinFilter === "ALL" || p.ministry === projectMinFilter).map((p) => (
            <div key={p.id} className="flex gap-2 items-center">
              <select className={inp} style={{ width: 160 }} value={p.ministry}
                onChange={(e) => setProjects(ps => ps.map(x => x.id === p.id ? { ...x, ministry: e.target.value } : x))}>
                <option value="">— Ministry —</option>
                {ministries.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
              </select>
              <input className={inp} value={p.code} placeholder="Code" style={{ width: 80 }}
                onChange={(e) => setProjects(ps => ps.map(x => x.id === p.id ? { ...x, code: e.target.value } : x))} />
              <input className={`${inp} flex-1`} value={p.name} placeholder="Project name"
                onChange={(e) => setProjects(ps => ps.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))} />
              <Button size="sm" variant="secondary" loading={saving} onClick={() => saveProject(p)}><Save size={13} /></Button>
              <Button size="sm" variant="ghost" onClick={() => deleteProject(p.id)}><Trash2 size={13} className="text-red-400" /></Button>
            </div>
          ))}
          {projects.filter(p => projectMinFilter === "ALL" || p.ministry === projectMinFilter).length === 0 && (
            <p className="text-sm text-stone-400">No projects yet{projectMinFilter !== "ALL" ? ` for ${projectMinFilter}` : ""}</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function DeptRow({ dept, onChange, onSave, onDelete, saving }: {
  dept: Dept; onChange: (d: Dept) => void;
  onSave: () => void; onDelete: () => void; saving: boolean;
}) {
  return (
    <div className="border border-stone-100 rounded-lg p-3 space-y-2">
      <div className="flex gap-2">
        <input className={`${inp} flex-1`} value={dept.name} placeholder="Department name"
          onChange={(e) => onChange({ ...dept, name: e.target.value })} />
        <Button size="sm" variant="secondary" loading={saving} onClick={onSave}><Save size={13} /></Button>
        <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 size={13} className="text-red-400" /></Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} value={dept.head_name} placeholder="Head name"
          onChange={(e) => onChange({ ...dept, head_name: e.target.value })} />
        <input className={inp} value={dept.head_email} placeholder="Head email"
          onChange={(e) => onChange({ ...dept, head_email: e.target.value })} />
      </div>
    </div>
  );
}

const inp = "border border-stone-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-[#4a6da7] bg-white w-full";
