-- The minute book, so a citation points at something.
--
-- 244, 245 and 249 made every budget decision name the EXCO resolution behind
-- it, which was right: a budget is the committee's decision and the app should
-- say which meeting took it. But the field was free text. "EXCO 2026/11",
-- "Nov EXCO" and "exco nov 26" are three references to one meeting and the app
-- could not tell, so the minute book and the budget could never be reconciled
-- by anything but a person reading both. Nothing stopped a reference to a
-- meeting that never happened, either.
--
-- So the register exists, and a citation becomes a pointer into it.
--
--   exco_meetings     one row per meeting held: its reference, its date, who
--                     chaired, and the minutes filed with it.
--   exco_resolutions  what that meeting resolved. A meeting has many; a
--                     decision cites one.
--
-- Three things follow.
--
--   1. The four decision functions take a resolution id instead of typed text.
--      They read the reference and the date off the register, so the two can
--      no longer disagree, and they refuse an id that is not there.
--
--   2. resolution_ref and resolution_date stay, written from the register.
--      Every report, printed budget and existing query reads those columns and
--      none of them has to change. They become a copy of the record rather
--      than the record.
--
--   3. A resolution already cited cannot be deleted. The authority under a
--      decision is not something to tidy away afterwards.
--
-- What is already cited is carried in. Every distinct reference on a decided
-- budget proposal or change request becomes a meeting with one resolution,
-- marked as having come from a citation rather than from the minute book, so
-- the Secretary knows which rows still need checking against the real thing.

BEGIN;

-- ---------------------------------------------------------------------------
-- Who keeps it
-- ---------------------------------------------------------------------------
-- The Secretary keeps the minutes, and the Administrator keeps the church's
-- records (223, 243). The five who may cite a resolution are added, because a
-- register nobody present can add to is a register that blocks the decision it
-- exists to support -- a Treasurer approving a budget at ten at night cannot
-- wait for the Secretary to type in the meeting they both attended.
CREATE OR REPLACE FUNCTION public.can_write_exco_register()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
  SELECT can_write_offices() OR can_decide_budget_change();
$fn$;

REVOKE ALL ON FUNCTION public.can_write_exco_register() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_write_exco_register() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The register
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS exco_meetings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref           TEXT NOT NULL,
  -- A resolution passed by circulation is still a resolution, and it is how a
  -- committee decides something that cannot wait for the next sitting.
  kind          TEXT NOT NULL DEFAULT 'EXCO'
                CHECK (kind IN ('EXCO', 'BOARD', 'AGM', 'EGM', 'CIRCULAR')),
  meeting_date  DATE NOT NULL,
  venue         TEXT,
  chaired_by    TEXT,
  minutes_url   TEXT,
  minutes_name  TEXT,
  notes         TEXT,
  recorded_by   TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One meeting, one reference. Case and stray spaces are not a difference
-- anybody means, which is the whole reason free text failed.
CREATE UNIQUE INDEX IF NOT EXISTS exco_meetings_ref_key
  ON exco_meetings (lower(btrim(ref)));
CREATE INDEX IF NOT EXISTS exco_meetings_date_idx
  ON exco_meetings (meeting_date DESC);

CREATE TABLE IF NOT EXISTS exco_resolutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  UUID NOT NULL REFERENCES exco_meetings(id) ON DELETE CASCADE,
  ref         TEXT NOT NULL,
  subject     TEXT NOT NULL,
  detail      TEXT,
  -- Where the resolution votes a sum or concerns one committee. Both optional:
  -- plenty of resolutions do neither.
  amount      NUMERIC,
  ministry    TEXT,
  recorded_by TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Numbered within the meeting, because that is how minutes number them.
CREATE UNIQUE INDEX IF NOT EXISTS exco_resolutions_ref_key
  ON exco_resolutions (meeting_id, lower(btrim(ref)));
CREATE INDEX IF NOT EXISTS exco_resolutions_meeting_idx
  ON exco_resolutions (meeting_id);

ALTER TABLE exco_meetings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE exco_resolutions ENABLE ROW LEVEL SECURITY;

-- Read by anyone signed in. A resolution is the church's own decision, and
-- somebody looking at a budget line has to be able to look up the authority
-- printed on it -- otherwise the citation is decoration.
DROP POLICY IF EXISTS exco_meetings_read ON exco_meetings;
CREATE POLICY exco_meetings_read ON exco_meetings
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS exco_meetings_write ON exco_meetings;
CREATE POLICY exco_meetings_write ON exco_meetings
  FOR ALL TO authenticated
  USING (can_write_exco_register()) WITH CHECK (can_write_exco_register());

DROP POLICY IF EXISTS exco_resolutions_read ON exco_resolutions;
CREATE POLICY exco_resolutions_read ON exco_resolutions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS exco_resolutions_write ON exco_resolutions;
CREATE POLICY exco_resolutions_write ON exco_resolutions
  FOR ALL TO authenticated
  USING (can_write_exco_register()) WITH CHECK (can_write_exco_register());

GRANT SELECT, INSERT, UPDATE, DELETE ON exco_meetings    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON exco_resolutions TO authenticated;

-- ---------------------------------------------------------------------------
-- What cites what
-- ---------------------------------------------------------------------------
-- RESTRICT, not CASCADE and not SET NULL. A decision that was taken under a
-- resolution stays taken under it; deleting the authority and leaving the
-- decision standing is the one outcome nobody could defend afterwards.
ALTER TABLE budget_proposals
  ADD COLUMN IF NOT EXISTS resolution_id UUID
  REFERENCES exco_resolutions(id) ON DELETE RESTRICT;

ALTER TABLE budget_change_requests
  ADD COLUMN IF NOT EXISTS resolution_id UUID
  REFERENCES exco_resolutions(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS budget_proposals_resolution_idx
  ON budget_proposals(resolution_id);
CREATE INDEX IF NOT EXISTS budget_change_requests_resolution_idx
  ON budget_change_requests(resolution_id);

COMMENT ON COLUMN budget_proposals.resolution_ref IS
  'The reference as it stood when the decision was recorded. Written from '
  'exco_resolutions via resolution_id -- a copy for reports to read, not the '
  'record itself.';
COMMENT ON COLUMN budget_change_requests.resolution_ref IS
  'The reference as it stood when the decision was recorded. Written from '
  'exco_resolutions via resolution_id -- a copy for reports to read, not the '
  'record itself.';

-- ---------------------------------------------------------------------------
-- What has already been cited
-- ---------------------------------------------------------------------------
-- Every reference typed into a decided budget decision becomes a meeting with
-- one resolution. Marked plainly: these came from a citation, not from the
-- minute book, and the dates and wording still want checking against it.
DO $backfill$
DECLARE
  c RECORD;
  v_meeting UUID;
  v_res     UUID;
BEGIN
  FOR c IN
    WITH cited AS (
      SELECT btrim(resolution_ref) AS ref, resolution_date AS d
        FROM budget_proposals
       WHERE COALESCE(btrim(resolution_ref), '') <> '' AND resolution_date IS NOT NULL
      UNION ALL
      SELECT btrim(resolution_ref), resolution_date
        FROM budget_change_requests
       WHERE COALESCE(btrim(resolution_ref), '') <> '' AND resolution_date IS NOT NULL
    )
    -- One meeting per reference. Where the same reference was typed against
    -- two dates somebody has made a mistake; the earliest is kept and the
    -- Secretary can correct it in the register, which is the point.
    SELECT ref, MIN(d) AS d FROM cited GROUP BY lower(ref), ref
  LOOP
    SELECT id INTO v_meeting FROM exco_meetings
     WHERE lower(btrim(ref)) = lower(c.ref);

    IF v_meeting IS NULL THEN
      INSERT INTO exco_meetings (ref, meeting_date, recorded_by, notes)
      VALUES (c.ref, c.d, 'backfill',
              'Carried in from a citation already on a budget decision. '
              || 'Check the date and the wording against the minute book.')
      RETURNING id INTO v_meeting;
    END IF;

    SELECT id INTO v_res FROM exco_resolutions
     WHERE meeting_id = v_meeting AND lower(btrim(ref)) = lower(c.ref);

    IF v_res IS NULL THEN
      INSERT INTO exco_resolutions (meeting_id, ref, subject, recorded_by)
      VALUES (v_meeting, c.ref,
              'Carried in from an existing citation', 'backfill');
    END IF;
  END LOOP;
END;
$backfill$;

UPDATE budget_proposals b SET resolution_id = r.id
  FROM exco_resolutions r JOIN exco_meetings m ON m.id = r.meeting_id
 WHERE b.resolution_id IS NULL
   AND lower(btrim(b.resolution_ref)) = lower(btrim(r.ref))
   AND lower(btrim(m.ref)) = lower(btrim(r.ref));

UPDATE budget_change_requests b SET resolution_id = r.id
  FROM exco_resolutions r JOIN exco_meetings m ON m.id = r.meeting_id
 WHERE b.resolution_id IS NULL
   AND lower(btrim(b.resolution_ref)) = lower(btrim(r.ref))
   AND lower(btrim(m.ref)) = lower(btrim(r.ref));

-- ---------------------------------------------------------------------------
-- Citing one
-- ---------------------------------------------------------------------------
-- Reads the reference and the date off the register. Every decision function
-- goes through it, so none of them can record a citation the register does not
-- contain, and none of them can record a date that disagrees with it.
CREATE OR REPLACE FUNCTION public.cite_resolution(
  p_resolution uuid, OUT v_ref text, OUT v_date date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  IF p_resolution IS NULL THEN
    RAISE EXCEPTION 'Cite the EXCO resolution this was decided under';
  END IF;

  SELECT r.ref, m.meeting_date INTO v_ref, v_date
    FROM exco_resolutions r
    JOIN exco_meetings m ON m.id = r.meeting_id
   WHERE r.id = p_resolution;

  IF v_ref IS NULL THEN
    RAISE EXCEPTION 'That resolution is not in the EXCO register';
  END IF;
  IF v_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'That meeting is in the future. A decision is recorded after the EXCO has met.';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.cite_resolution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cite_resolution(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The four decisions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_budget_proposal(
  proposal uuid, decided_by_email text, p_resolution uuid, note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  target_ministry TEXT;
  target_year     INT;
  v_ref           TEXT;
  v_date          DATE;
BEGIN
  IF NOT can_record_budget_decision() THEN
    RAISE EXCEPTION 'Only the Treasurer or a Finance Executive may record a budget decision';
  END IF;

  SELECT c.v_ref, c.v_date INTO v_ref, v_date FROM cite_resolution(p_resolution) c;

  SELECT ministry, year INTO target_ministry, target_year
    FROM budget_proposals WHERE id = proposal;
  IF target_ministry IS NULL THEN
    RAISE EXCEPTION 'Budget proposal not found';
  END IF;

  -- Replace any live lines for that ministry/year, so approving a revised
  -- proposal doesn't leave superseded lines behind alongside it.
  DELETE FROM budget_items
   WHERE ministry = target_ministry AND year = target_year AND proposal_id IS NULL;

  UPDATE budget_items SET proposal_id = NULL WHERE proposal_id = proposal;

  UPDATE budget_proposals
     SET status = 'APPROVED', decided_by = decided_by_email,
         decided_at = NOW(), decision_note = note,
         resolution_id = p_resolution,
         resolution_ref = v_ref, resolution_date = v_date
   WHERE id = proposal;
END;
$fn$;

REVOKE ALL ON FUNCTION public.approve_budget_proposal(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_budget_proposal(uuid, text, uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reject_budget_proposal(
  proposal uuid, decided_by_email text, p_resolution uuid, note text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_note TEXT := NULLIF(btrim(COALESCE(note, '')), '');
  v_ref  TEXT;
  v_date DATE;
BEGIN
  IF NOT can_record_budget_decision() THEN
    RAISE EXCEPTION 'Only the Treasurer or a Finance Executive may record a budget decision';
  END IF;
  IF v_note IS NULL THEN
    RAISE EXCEPTION 'Give a reason, so the ministry knows what to revise';
  END IF;

  SELECT c.v_ref, c.v_date INTO v_ref, v_date FROM cite_resolution(p_resolution) c;

  UPDATE budget_proposals
     SET status = 'REJECTED', decided_by = decided_by_email,
         decided_at = NOW(), decision_note = v_note,
         resolution_id = p_resolution,
         resolution_ref = v_ref, resolution_date = v_date
   WHERE id = proposal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Budget proposal not found';
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.reject_budget_proposal(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_budget_proposal(uuid, text, uuid, text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_budget_change_request(
  request uuid, p_year int, p_resolution uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  r      record;
  me     text := auth.jwt() ->> 'email';
  v_ref  text;
  v_date date;
  moved  int;
BEGIN
  IF NOT can_decide_budget_change() THEN
    RAISE EXCEPTION 'You may not decide budget change requests';
  END IF;

  SELECT c.v_ref, c.v_date INTO v_ref, v_date FROM cite_resolution(p_resolution) c;

  SELECT * INTO r FROM budget_change_requests WHERE id = request;
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'Change request not found';
  END IF;
  IF r.status <> 'pending' THEN
    RAISE EXCEPTION 'That request has already been %', r.status;
  END IF;

  IF r.change_type = 'add' THEN
    IF COALESCE(btrim(r.proposed_data->>'project_name'), '') = '' THEN
      RAISE EXCEPTION 'That request does not name the line to add';
    END IF;
    INSERT INTO budget_items(
      ministry, year, project_name, project_type, description,
      estimated_income, estimated_expenses, special_notes,
      document_url, document_name, parent_id, created_by)
    VALUES (
      r.ministry, p_year,
      r.proposed_data->>'project_name',
      COALESCE(r.proposed_data->>'project_type', 'expense'),
      r.proposed_data->>'description',
      COALESCE((r.proposed_data->>'estimated_income')::numeric, 0),
      COALESCE((r.proposed_data->>'estimated_expenses')::numeric, 0),
      r.proposed_data->>'special_notes',
      r.proposed_data->>'document_url',
      r.proposed_data->>'document_name',
      NULLIF(r.proposed_data->>'parent_id', '')::uuid,
      r.requested_by);

  ELSIF r.change_type = 'edit' THEN
    IF r.budget_item_id IS NULL THEN
      RAISE EXCEPTION 'The budget line this request refers to has been deleted';
    END IF;
    UPDATE budget_items b SET
      project_name       = COALESCE(r.proposed_data->>'project_name', b.project_name),
      project_type       = COALESCE(r.proposed_data->>'project_type', b.project_type),
      description        = COALESCE(r.proposed_data->>'description', b.description),
      estimated_income   = COALESCE((r.proposed_data->>'estimated_income')::numeric, b.estimated_income),
      estimated_expenses = COALESCE((r.proposed_data->>'estimated_expenses')::numeric, b.estimated_expenses),
      special_notes      = COALESCE(r.proposed_data->>'special_notes', b.special_notes),
      document_url       = COALESCE(r.proposed_data->>'document_url', b.document_url),
      document_name      = COALESCE(r.proposed_data->>'document_name', b.document_name),
      updated_at         = now()
     WHERE b.id = r.budget_item_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    IF moved = 0 THEN
      RAISE EXCEPTION 'That budget line no longer exists';
    END IF;

  ELSIF r.change_type = 'delete' THEN
    IF r.budget_item_id IS NULL THEN
      RAISE EXCEPTION 'The budget line this request refers to has already been deleted';
    END IF;
    DELETE FROM budget_items WHERE id = r.budget_item_id;
    GET DIAGNOSTICS moved = ROW_COUNT;
    IF moved = 0 THEN
      RAISE EXCEPTION 'That budget line no longer exists';
    END IF;

  ELSE
    RAISE EXCEPTION 'Unknown change type %', r.change_type;
  END IF;

  UPDATE budget_change_requests
     SET status = 'approved', approved_by = me, approved_at = now(),
         applied_by = me, applied_at = now(),
         resolution_id = p_resolution,
         resolution_ref = v_ref, resolution_date = v_date
   WHERE id = request;
END;
$fn$;

REVOKE ALL ON FUNCTION public.apply_budget_change_request(uuid, int, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_budget_change_request(uuid, int, uuid)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.decline_budget_change_request(
  request uuid, reason text, p_resolution uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  me     text := auth.jwt() ->> 'email';
  v_why  text := NULLIF(btrim(COALESCE(reason, '')), '');
  v_stat text;
  v_ref  text;
  v_date date;
BEGIN
  IF NOT can_decide_budget_change() THEN
    RAISE EXCEPTION 'You may not decide budget change requests';
  END IF;
  IF v_why IS NULL THEN
    RAISE EXCEPTION 'Give a reason, so the ministry knows why';
  END IF;

  SELECT c.v_ref, c.v_date INTO v_ref, v_date FROM cite_resolution(p_resolution) c;

  SELECT status INTO v_stat FROM budget_change_requests WHERE id = request;
  IF v_stat IS NULL THEN RAISE EXCEPTION 'Change request not found'; END IF;
  IF v_stat <> 'pending' THEN RAISE EXCEPTION 'That request has already been %', v_stat; END IF;

  UPDATE budget_change_requests
     SET status = 'rejected', rejected_by = me, rejected_at = now(),
         rejection_reason = v_why,
         resolution_id = p_resolution,
         resolution_ref = v_ref, resolution_date = v_date
   WHERE id = request;
END;
$fn$;

REVOKE ALL ON FUNCTION public.decline_budget_change_request(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.decline_budget_change_request(uuid, text, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The typed-text forms, which now refuse
-- ---------------------------------------------------------------------------
-- Same treatment 244 gave the form before it. A browser still running the
-- previous build would otherwise get "function does not exist", which reads
-- like a fault in the app rather than a page that needs reloading. These keep
-- their old argument names, so an old call lands here and not on the new form.
CREATE OR REPLACE FUNCTION public.approve_budget_proposal(
  proposal uuid, decided_by_email text,
  p_resolution_ref text, p_resolution_date date, note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. A budget decision now '
                  'cites a resolution from the EXCO register rather than typed text.';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.reject_budget_proposal(
  proposal uuid, decided_by_email text,
  p_resolution_ref text, p_resolution_date date, note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. A budget decision now '
                  'cites a resolution from the EXCO register rather than typed text.';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.apply_budget_change_request(
  request uuid, p_year int,
  p_resolution_ref text DEFAULT NULL, p_resolution_date date DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. A budget decision now '
                  'cites a resolution from the EXCO register rather than typed text.';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.decline_budget_change_request(
  request uuid, reason text,
  p_resolution_ref text, p_resolution_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. A budget decision now '
                  'cites a resolution from the EXCO register rather than typed text.';
END;
$fn$;

-- 246's two-argument forms, which decided a change with no resolution at all,
-- are closed the same way. Nothing in the app calls them; leaving a door open
-- that bypasses the register would make the register advisory.
CREATE OR REPLACE FUNCTION public.apply_budget_change_request(
  request uuid, p_year int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. A budget decision now '
                  'cites a resolution from the EXCO register.';
END;
$fn$;

CREATE OR REPLACE FUNCTION public.decline_budget_change_request(
  request uuid, reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RAISE EXCEPTION 'This page is out of date — reload it. A budget decision now '
                  'cites a resolution from the EXCO register.';
END;
$fn$;

COMMIT;
