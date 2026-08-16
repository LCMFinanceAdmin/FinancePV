-- 129: a shared to-do list on the dashboard.
--
-- The app tracks what the system knows is outstanding — vouchers awaiting a
-- signature, claims awaiting a PV. It has never had anywhere for the things a
-- person knows are outstanding: chase the bank about the FD, get the Treasurer
-- to sign before Friday, ask the Mission desk for last month's receipts.
--
-- Deliberately plain. Four fields, a tick and a delete. The moment a to-do list
-- grows priorities, labels and sub-tasks it becomes a thing people maintain
-- instead of a thing that helps them, and the church already has a system of
-- record for anything that matters more than this.

CREATE TABLE IF NOT EXISTS tasks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  description TEXT NOT NULL,
  -- The day it belongs to — usually today, sometimes the day it arose.
  task_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  -- When it has to be finished. Null is a task with no date attached, which is
  -- most of them.
  due_date    DATE,

  -- Who is meant to do it. Held as an address rather than a person id because
  -- that is what the whole app joins on, and a task may be given to somebody
  -- who has an account but no directory record.
  assigned_to TEXT,

  -- Others who should see it. The assignee and the author are implied and are
  -- not repeated here.
  shared_with TEXT[] NOT NULL DEFAULT '{}',

  created_by  TEXT NOT NULL,
  done        BOOLEAN NOT NULL DEFAULT FALSE,
  -- Kept rather than just flipping the flag: "who ticked this, and when" is the
  -- first question asked about anything that turns out not to have been done.
  done_at     TIMESTAMPTZ,
  done_by     TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT description_not_blank CHECK (length(trim(description)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks (lower(assigned_to)) WHERE NOT done;
CREATE INDEX IF NOT EXISTS idx_tasks_creator  ON tasks (lower(created_by));
CREATE INDEX IF NOT EXISTS idx_tasks_due      ON tasks (due_date) WHERE NOT done;

-- ── Who may see a task ────────────────────────────────────────────────────
-- The author, whoever it was given to, and anyone it was shared with. Written
-- once so the read policy and the write policy cannot drift into disagreeing
-- about whose task this is.
CREATE OR REPLACE FUNCTION can_see_task(
  p_created_by TEXT, p_assigned_to TEXT, p_shared_with TEXT[]
) RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  SELECT lower(COALESCE(auth.jwt() ->> 'email', '')) <> ''
     AND (
       lower(p_created_by) = lower(auth.jwt() ->> 'email')
       OR lower(COALESCE(p_assigned_to, '')) = lower(auth.jwt() ->> 'email')
       OR lower(auth.jwt() ->> 'email') = ANY (
            SELECT lower(x) FROM unnest(COALESCE(p_shared_with, '{}')) AS x)
     );
$$;

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_read"   ON tasks;
DROP POLICY IF EXISTS "tasks_insert" ON tasks;
DROP POLICY IF EXISTS "tasks_update" ON tasks;
DROP POLICY IF EXISTS "tasks_delete" ON tasks;

CREATE POLICY "tasks_read" ON tasks FOR SELECT TO authenticated
  USING (can_see_task(created_by, assigned_to, shared_with));

-- You may only create a task in your own name, or it becomes possible to put
-- words in somebody else's mouth on their own dashboard.
CREATE POLICY "tasks_insert" ON tasks FOR INSERT TO authenticated
  WITH CHECK (lower(created_by) = lower(auth.jwt() ->> 'email'));

-- Anyone who can see it can tick it — a shared list where only the author may
-- mark something done is a list that goes stale.
CREATE POLICY "tasks_update" ON tasks FOR UPDATE TO authenticated
  USING (can_see_task(created_by, assigned_to, shared_with))
  WITH CHECK (can_see_task(created_by, assigned_to, shared_with));

-- Deleting is the author's alone. Being shown a task is not permission to
-- remove it from everybody else's list.
CREATE POLICY "tasks_delete" ON tasks FOR DELETE TO authenticated
  USING (lower(created_by) = lower(auth.jwt() ->> 'email'));

GRANT SELECT, INSERT, UPDATE, DELETE ON tasks TO authenticated;
REVOKE ALL ON FUNCTION can_see_task(TEXT, TEXT, TEXT[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION can_see_task(TEXT, TEXT, TEXT[]) TO authenticated;

COMMENT ON TABLE tasks IS
  'Personal and shared to-dos on the dashboard. Visible to the author, the assignee and anyone it is shared with.';
