-- 153: a Dean is posted to a congregation, not to HQ.
--
-- The Dean rule reads congregation_id and head_pastor_email, and both forms now
-- clear the congregation when somebody is posted to HQ — so today the two agree.
-- But that agreement rests entirely on the forms. A pastor who belonged to a
-- congregation as a member and was later posted to HQ by a route that did not
-- clear it would still read as eligible, and the failure would be silent: a
-- picker offering somebody who cannot hold the post.
--
-- Deanery is a district post held by somebody serving a church in it. Saying so
-- here means the rule holds wherever the data came from.
CREATE OR REPLACE FUNCTION office_eligibility(p_office_id UUID, p_person_id UUID)
RETURNS TEXT
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o offices%ROWTYPE;
  p people%ROWTYPE;
  v_districts UUID[];
BEGIN
  SELECT * INTO o FROM offices WHERE id = p_office_id;
  SELECT * INTO p FROM people  WHERE id = p_person_id;
  IF NOT FOUND OR o.id IS NULL THEN RETURN NULL; END IF;

  IF o.grants_role IN ('BISHOP','SECRETARY') THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — this post is open to Reverends only';
    ELSIF is_retired_standing(p.pastor_standing) THEN
      RETURN 'Retired pastors cannot stand for this post';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN 'Open to Reverends only — not yet ordained';
    END IF;
    RETURN NULL;
  END IF;

  IF o.grants_role = 'TREASURER' THEN
    IF p.pastor_standing IS NOT NULL THEN
      RETURN 'Treasurer is a lay post — open to volunteers, not to ministry';
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No church affiliation recorded — this post is open to LCM members only';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to members of an LCM congregation only';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'DEAN' THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — a Dean must be a Reverend';
    ELSIF is_retired_standing(p.pastor_standing) THEN
      RETURN 'Retired pastors cannot serve as Dean';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN 'A Dean must be a Reverend';
    -- Checked before the district lookup so the reason names the actual
    -- obstacle. "No LCM congregation recorded" would send somebody off to
    -- record one, which is not the problem and not the fix.
    ELSIF p.posting = 'HQ' THEN
      RETURN 'Posted to HQ — a Dean serves a congregation in the district';
    END IF;

    SELECT array_agg(DISTINCT c.district_id) INTO v_districts
      FROM congregations c
     WHERE c.district_id IS NOT NULL
       AND (
            c.id = p.congregation_id
         OR (
              COALESCE(NULLIF(btrim(p.user_email), ''), NULLIF(btrim(p.email), '')) IS NOT NULL
              AND lower(btrim(c.head_pastor_email)) =
                  lower(COALESCE(NULLIF(btrim(p.user_email), ''), NULLIF(btrim(p.email), '')))
            )
       );

    IF v_districts IS NULL OR array_length(v_districts, 1) IS NULL THEN
      RETURN 'No LCM congregation recorded — a Dean serves, or belongs to, a church in the district';
    ELSIF o.district_id IS NOT NULL AND NOT (o.district_id = ANY(v_districts)) THEN
      RETURN 'Their congregation is in another district';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'EXCO' THEN
    IF is_retired_standing(p.pastor_standing) THEN
      RETURN 'Retired pastors cannot hold an EXCO portfolio';
    ELSIF p.pastor_standing IS NOT NULL THEN
      RETURN NULL;
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No standing or church affiliation recorded — EXCO is open to ministry and to LCM members';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to ministry and to members of an LCM congregation';
    END IF;
    RETURN NULL;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION office_eligibility(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION office_eligibility(UUID, UUID) TO authenticated;
