"use client";
// The dashboard's to-do list.
//
// Everything else on this page is what the system knows is outstanding. This is
// for what a person knows is outstanding and the system has no way to find out:
// chase the bank about the fixed deposit, get the Treasurer to sign before
// Friday, ask Mission for last month's receipts.
//
// Shared rather than private, because most of these are actually about somebody
// else. A task given to the Accounts Executive appears on her dashboard, and
// either of them can tick it off — a shared list where only the author may mark
// something done goes stale within a week.

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { fieldClass, labelClass } from "@/lib/field-styles";
import { Modal } from "@/components/ui/modal";
import { Plus, Trash2, Users, CalendarClock, ListChecks } from "lucide-react";

interface Task {
  id: string;
  description: string;
  task_date: string;
  due_date: string | null;
  assigned_to: string | null;
  shared_with: string[];
  created_by: string;
  done: boolean;
  done_by: string | null;
}
interface Account { email: string; full_name: string | null }

/** "Fri 22 Aug", or "Overdue — Fri 22 Aug" once the day has passed. */
function dueLabel(due: string | null): { text: string; late: boolean } | null {
  if (!due) return null;
  const d = new Date(due + "T00:00:00");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const text = d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return { text, late: d < today };
}

export function TodoList({ userEmail }: { userEmail: string }) {
  const supabase = createClient();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [adding, setAdding] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [{ data: t, error }, { data: a }] = await Promise.all([
      // RLS decides what comes back — author, assignee or shared with.
      supabase.from("tasks").select("*")
        .order("done").order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("user_roles").select("email,full_name").order("full_name"),
    ]);
    if (error) setErr(error.message);
    setTasks((t ?? []) as Task[]);
    setAccounts((a ?? []) as Account[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const nameOf = useCallback((email?: string | null) => {
    if (!email) return "";
    const a = accounts.find(x => x.email.toLowerCase() === email.toLowerCase());
    return a?.full_name || email;
  }, [accounts]);

  async function toggle(t: Task) {
    // Optimistic: a tick that waits for a round trip feels broken.
    setTasks(prev => prev.map(x => x.id === t.id ? { ...x, done: !x.done } : x));
    const { error } = await supabase.from("tasks").update({
      done: !t.done,
      done_at: !t.done ? new Date().toISOString() : null,
      done_by: !t.done ? userEmail : null,
      updated_at: new Date().toISOString(),
    }).eq("id", t.id);
    if (error) { setErr(error.message); await load(); }
  }

  async function remove(t: Task) {
    if (!confirm(`Delete “${t.description}”?`)) return;
    const { error } = await supabase.from("tasks").delete().eq("id", t.id);
    if (error) { setErr(error.message); return; }
    await load();
  }

  const open = useMemo(() => tasks.filter(t => !t.done), [tasks]);
  const done = useMemo(() => tasks.filter(t => t.done), [tasks]);
  const shown = showDone ? [...open, ...done] : open;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <ListChecks size={15} className="text-[#4a6da7]" />
          <h2 className="text-[13px] font-bold text-stone-800">To do</h2>
          {open.length > 0 && (
            <span className="rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-600">
              {open.length}
            </span>
          )}
        </div>
        <button onClick={() => setAdding(true)}
          className="flex items-center gap-1 text-[11px] font-semibold text-[#2f5b9c] hover:underline">
          <Plus size={12} /> Add
        </button>
      </div>

      {err && <p className="mb-2 text-[11px] font-medium text-red-600" role="alert">{err}</p>}

      {loading ? (
        <p className="py-4 text-center text-[11px] text-stone-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="py-5 text-center text-[11px] text-stone-400">
          Nothing on the list. Add what the system cannot see for itself.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map(t => {
            const due = dueLabel(t.due_date);
            const mine = t.created_by.toLowerCase() === userEmail.toLowerCase();
            return (
              <li key={t.id}
                className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${
                  t.done ? "border-stone-100 bg-stone-50" : "border-stone-200 bg-white"}`}>
                <input type="checkbox" checked={t.done} onChange={() => toggle(t)}
                  aria-label={`Mark “${t.description}” ${t.done ? "not done" : "done"}`}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#2f5b9c]" />
                <div className="min-w-0 flex-1">
                  <p className={`text-[12px] leading-snug ${
                    t.done ? "text-stone-400 line-through" : "text-stone-800"}`}>
                    {t.description}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-stone-400">
                    <span>{new Date(t.task_date + "T00:00:00").toLocaleDateString("en-GB",
                      { day: "numeric", month: "short" })}</span>
                    {t.assigned_to && (
                      <span className="inline-flex items-center gap-0.5">
                        <Users size={9} /> {nameOf(t.assigned_to)}
                      </span>
                    )}
                    {due && (
                      <span className={`inline-flex items-center gap-0.5 ${
                        due.late && !t.done ? "font-semibold text-red-600" : ""}`}>
                        <CalendarClock size={9} /> {due.late && !t.done ? "Overdue · " : "by "}{due.text}
                      </span>
                    )}
                    {t.done && t.done_by && <span>✓ {nameOf(t.done_by)}</span>}
                  </div>
                </div>
                {/* Only the author may delete — being shown a task is not
                    permission to take it off everybody else's list. */}
                {mine && (
                  <button onClick={() => remove(t)} aria-label={`Delete “${t.description}”`}
                    className="shrink-0 rounded p-0.5 text-stone-300 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {done.length > 0 && (
        <button onClick={() => setShowDone(v => !v)}
          className="mt-2 text-[10px] font-medium text-stone-400 hover:text-stone-600">
          {showDone ? "Hide" : `Show ${done.length} done`}
        </button>
      )}

      {adding && (
        <AddTask accounts={accounts} userEmail={userEmail}
          onClose={() => setAdding(false)}
          onSaved={async () => { setAdding(false); await load(); }} />
      )}
    </div>
  );
}

function AddTask({ accounts, userEmail, onClose, onSaved }: {
  accounts: Account[]; userEmail: string; onClose: () => void; onSaved: () => void;
}) {
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [description, setDescription] = useState("");
  const [taskDate, setTaskDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [sharedWith, setSharedWith] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!description.trim()) { setErr("What needs doing?"); return; }
    if (dueDate && dueDate < taskDate) { setErr("The deadline is before the task's own date"); return; }
    setErr(""); setSaving(true);
    const { error } = await supabase.from("tasks").insert({
      description: description.trim(),
      task_date: taskDate,
      due_date: dueDate || null,
      assigned_to: assignedTo || null,
      // The assignee is implied, so sharing it with them as well would show the
      // same person twice on the task.
      shared_with: sharedWith.filter(e => e !== assignedTo),
      created_by: userEmail,
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  }

  const others = accounts.filter(a => a.email.toLowerCase() !== userEmail.toLowerCase());

  return (
    <Modal
      title="Add a task"
      description="Yours unless you give it to somebody. Anyone who can see it can tick it off."
      onClose={onClose}
      footer={<>
        <Button className="flex-1" loading={saving} onClick={save}><Plus size={13} /> Add</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}
    >
      <div>
        <label className={labelClass}>What needs doing *</label>
        <input className={fieldClass} value={description} autoFocus
          onChange={e => setDescription(e.target.value)}
          placeholder="e.g. Chase the bank about the FD maturity" />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" className={fieldClass} value={taskDate}
            onChange={e => setTaskDate(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>Deadline</label>
          <input type="date" className={fieldClass} value={dueDate}
            onChange={e => setDueDate(e.target.value)} />
          <p className="mt-1 text-[11px] text-stone-500">Optional. Overdue tasks turn red.</p>
        </div>
      </div>

      <div>
        <label className={labelClass}>Who</label>
        <select className={fieldClass} value={assignedTo} onChange={e => setAssignedTo(e.target.value)}>
          <option value="">Me</option>
          {others.map(a => <option key={a.email} value={a.email}>{a.full_name || a.email}</option>)}
        </select>
        <p className="mt-1 text-[11px] text-stone-500">
          It appears on their dashboard, and either of you can tick it off.
        </p>
      </div>

      <div>
        <label className={labelClass}>Also visible to</label>
        <div className="max-h-32 space-y-1 overflow-y-auto rounded-lg border-2 border-stone-800 p-2">
          {others.length === 0 ? (
            <p className="text-[11px] text-stone-400">Nobody else has an account yet.</p>
          ) : others.map(a => (
            <label key={a.email} className="flex items-center gap-2 text-[12px] text-stone-700">
              <input type="checkbox" className="h-3.5 w-3.5 accent-[#2f5b9c]"
                checked={sharedWith.includes(a.email)}
                onChange={e => setSharedWith(prev =>
                  e.target.checked ? [...prev, a.email] : prev.filter(x => x !== a.email))} />
              {a.full_name || a.email}
            </label>
          ))}
        </div>
      </div>

      {err && <p className="text-xs font-medium text-red-600" role="alert">{err}</p>}
    </Modal>
  );
}
