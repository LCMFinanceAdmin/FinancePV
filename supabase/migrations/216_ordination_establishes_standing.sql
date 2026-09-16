-- 216: ordination is what makes a Reverend, not a status field.
--
-- Every Dean named on 16 September came back flagged "No standing recorded — a
-- Dean must be a Reverend", against six people whose ordination is REVEREND.
-- The rule says one thing and tests another: it requires ministry_status to be
-- filled in before it will look at ordination at all, and treats a blank as a
-- disqualification.
--
-- ministry_status is recorded for 18 of 105 people. Thirty-seven Reverends have
-- none, so the post that is "open to Reverends only" was closed to most of the
-- Reverends in the church.
--
-- A blank field means not recorded. It does not mean not in ministry, and it
-- certainly does not outrank an ordination that is recorded. So ordination is
-- asked first, and ministry_status keeps the job it can actually do: saying
-- somebody has retired. is_retired_ministry(NULL) is NULL rather than true, so
-- an unrecorded status no longer refuses anybody.
--
-- The lay posts are tightened by the same reasoning. Treasurer excluded anyone
-- with a ministry_status; a Reverend with none would have passed it. Being
-- ordained now disqualifies from the lay post and qualifies for the EXCO one,
-- which is what both rules meant all along.

CREATE OR REPLACE FUNCTION office_eligibility(p_office_id uuid, p_person_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  o offices%ROWTYPE;
  p people%ROWTYPE;
  v_districts UUID[];
  v_ordained  BOOLEAN;
  v_ministry  BOOLEAN;
BEGIN
  SELECT * INTO o FROM offices WHERE id = p_office_id;
  SELECT * INTO p FROM people  WHERE id = p_person_id;
  IF NOT FOUND OR o.id IS NULL THEN RETURN NULL; END IF;

  v_ordained := p.ordination IS NOT NULL;
  -- In ministry: ordained, or a standing recorded that says so.
  v_ministry := v_ordained OR p.ministry_status IS NOT NULL;

  IF o.grants_role IN ('BISHOP','SECRETARY') THEN
    IF p.ordination IS NULL THEN
      RETURN 'No ordination recorded — this post is open to Reverends only';
    ELSIF p.ordination <> 'REVEREND' THEN
      RETURN 'Open to Reverends only — not yet ordained';
    ELSIF is_retired_ministry(p.ministry_status) THEN
      RETURN 'Retired pastors cannot stand for this post';
    END IF;
    RETURN NULL;
  END IF;

  IF o.grants_role = 'TREASURER' THEN
    IF v_ministry THEN
      RETURN 'Treasurer is a lay post — open to volunteers, not to ministry';
    ELSIF p.affiliation IS NULL THEN
      RETURN 'No church affiliation recorded — this post is open to LCM members only';
    ELSIF p.affiliation <> 'LCM_MEMBER' THEN
      RETURN 'Open to members of an LCM congregation only';
    END IF;
    RETURN NULL;
  END IF;

  IF o.kind = 'DEAN' THEN
    IF p.ordination IS NULL THEN
      RETURN 'No ordination recorded — a Dean must be a Reverend';
    ELSIF p.ordination <> 'REVEREND' THEN
      RETURN 'A Dean must be a Reverend';
    ELSIF is_retired_ministry(p.ministry_status) THEN
      RETURN 'Retired pastors cannot serve as Dean';
    ELSIF p.posting = 'HQ' THEN
      RETURN 'Posted to HQ — a Dean serves a congregation in the district';
    END IF;

    -- Unchanged: a Dean serves, or belongs to, a church in their district.
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
    IF is_retired_ministry(p.ministry_status) THEN
      RETURN 'Retired pastors cannot hold an EXCO portfolio';
    ELSIF v_ministry THEN
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

SELECT d.name AS district, p.full_name AS dean,
       COALESCE(office_eligibility(o.id, p.id), 'eligible') AS verdict
  FROM districts d
  JOIN offices o ON o.district_id = d.id AND o.kind = 'DEAN'
  JOIN people  p ON lower(COALESCE(NULLIF(p.user_email,''), p.email)) = lower(d.dean_email)
 ORDER BY d.name;
