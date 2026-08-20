-- 155: setting a Dean here records a term, the way electing one does.
--
-- There have always been two doors onto the same fact. Offices & Elections
-- creates an office_holdings row — who, from when, until when — and updates
-- districts.dean_email as the working copy leave routing reads. The Church
-- Directory only ever wrote the copy. So a Dean set here held the post with no
-- record of when they took it and no trace once they left: Central District 1
-- has a Dean today and an empty register.
--
-- That is why the page could not show a term or a history. Rather than add a
-- second place to keep dates, this makes the Directory write what the register
-- already expects, so both doors leave the same trail.

-- ── Whoever is already recorded gets a holding ────────────────────────────
-- Same carry-over migration 101 did, for the ones set through the Directory
-- since. Dated today because the real start date is not recoverable — it was
-- never captured, and inventing one would read as fact.
INSERT INTO office_holdings (office_id, person_id, term_start, note, created_by)
SELECT o.id, p.id, CURRENT_DATE, 'carried over from the district record', 'migration 155'
FROM offices o
JOIN districts d ON d.id = o.district_id
JOIN people p
  ON lower(COALESCE(NULLIF(btrim(p.user_email), ''), btrim(p.email))) = lower(btrim(d.dean_email))
WHERE o.kind = 'DEAN'
  AND COALESCE(btrim(d.dean_email), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM office_holdings h WHERE h.office_id = o.id AND h.term_end IS NULL
  );

-- ── Appointing, re-dating, or clearing a Dean ─────────────────────────────
-- One function for all three because they are one decision, and doing them as
-- separate statements from the page would let a failure land halfway: the
-- working copy pointing at somebody the register says left.
CREATE OR REPLACE FUNCTION set_district_dean(
  p_district_id UUID,
  p_person_id   UUID,          -- null clears the post
  p_term_start  DATE DEFAULT NULL,
  p_term_end    DATE DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_office_id  UUID;
  v_current    office_holdings%ROWTYPE;
  v_email      TEXT;
  v_start      DATE := COALESCE(p_term_start, CURRENT_DATE);
BEGIN
  IF NOT can_manage_directory() THEN
    RAISE EXCEPTION 'Not allowed to change the church directory';
  END IF;

  SELECT id INTO v_office_id FROM offices
   WHERE district_id = p_district_id AND kind = 'DEAN' LIMIT 1;
  IF v_office_id IS NULL THEN
    RAISE EXCEPTION 'That district has no Dean post';
  END IF;

  -- Currently held means not yet ended, which is not the same as having no
  -- end date: a term can be recorded with an end in the future and still be
  -- the one being served. Matching only on NULL would miss it, and the
  -- handover below would then open a second term overlapping the first.
  SELECT * INTO v_current FROM office_holdings
   WHERE office_id = v_office_id
     AND (term_end IS NULL OR term_end >= CURRENT_DATE)
   ORDER BY term_start DESC NULLS LAST LIMIT 1;

  -- Cleared: close the term, drop the working copy.
  IF p_person_id IS NULL THEN
    IF v_current.id IS NOT NULL THEN
      -- Clearing the post means they do not hold it now, so an end date still
      -- in the future is brought back to today. A date already in the past is
      -- kept — that is somebody recording a term that ended a while ago.
      -- Never before it started, which would read as a term of negative length.
      UPDATE office_holdings
         SET term_end = GREATEST(
               COALESCE(term_start, CURRENT_DATE),
               LEAST(COALESCE(p_term_end, CURRENT_DATE), CURRENT_DATE))
       WHERE id = v_current.id;
    END IF;
    UPDATE districts SET dean_email = NULL, updated_at = NOW() WHERE id = p_district_id;
    RETURN;
  END IF;

  SELECT COALESCE(NULLIF(btrim(user_email), ''), btrim(email)) INTO v_email
    FROM people WHERE id = p_person_id;
  IF COALESCE(v_email, '') = '' THEN
    -- Leave routing matches on this address, so a Dean without one would be
    -- appointed and unreachable — which looks like it worked.
    RAISE EXCEPTION 'That person has no email address, so leave could not reach them';
  END IF;

  IF v_current.id IS NOT NULL AND v_current.person_id = p_person_id THEN
    -- Same person: this is a correction to the dates, not a handover.
    UPDATE office_holdings SET term_start = v_start, term_end = p_term_end
     WHERE id = v_current.id;
  ELSE
    -- A handover. The outgoing term ends the day before the incoming one
    -- starts, so the two do not both read as current on the same date.
    IF v_current.id IS NOT NULL THEN
      UPDATE office_holdings
         SET term_end = GREATEST(COALESCE(v_current.term_start, v_start), v_start - 1)
       WHERE id = v_current.id;
    END IF;
    INSERT INTO office_holdings (office_id, person_id, term_start, term_end, created_by)
    VALUES (v_office_id, p_person_id, v_start, p_term_end, auth.email());
  END IF;

  UPDATE districts SET dean_email = v_email, updated_at = NOW() WHERE id = p_district_id;
END;
$$;

REVOKE ALL ON FUNCTION set_district_dean(UUID, UUID, DATE, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_district_dean(UUID, UUID, DATE, DATE) TO authenticated;

-- ── Who has held each district's post ─────────────────────────────────────
-- An RPC rather than a nested select, for the same reason dean_candidates() is
-- one: PostgREST has to be told how office_holdings reaches people, and a
-- mis-guessed relationship returns no rows instead of an error — an empty
-- history and a broken query look identical.
CREATE OR REPLACE FUNCTION dean_history()
RETURNS TABLE (
  district_id UUID, holding_id UUID, person_id UUID,
  full_name TEXT, ordination TEXT, term_start DATE, term_end DATE
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT o.district_id, h.id, p.id, p.full_name, p.ordination, h.term_start, h.term_end
    FROM office_holdings h
    JOIN offices o ON o.id = h.office_id AND o.kind = 'DEAN'
    LEFT JOIN people p ON p.id = h.person_id
   WHERE o.district_id IS NOT NULL
   ORDER BY o.district_id, h.term_start DESC NULLS LAST;
$$;

REVOKE ALL ON FUNCTION dean_history() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dean_history() TO authenticated;

COMMENT ON COLUMN districts.dean_email IS
  'Working copy of the current Dean, kept in step by Offices & Elections and by set_district_dean(). Leave routing reads this; office_holdings is the record.';
