-- 148: a pastor belongs to the church they SERVE, not only the one they joined.
--
-- 146 tested a Dean's district through people.congregation_id, which records
-- membership. That missed the obvious case and the common one: a Reverend made
-- head pastor of a church in the district was still told "no LCM congregation
-- recorded", because the church they serve is recorded on the CONGREGATION, as
-- head_pastor_email, and nothing was reading it.
--
-- Two routes now count, and either is enough:
--
--   * a congregation on the person, which is where they are a member; or
--   * a congregation whose head pastor they are, which is where they serve.
--
-- Serving is if anything the stronger claim — a Dean leads the pastors of a
-- district, and being one of them is the point.
--
-- Matched on COALESCE(user_email, email) because that is what the head pastor
-- picker stores: their login where they have one, their contact address
-- otherwise. Comparing against only one of the two would reintroduce the same
-- silence for whoever happens to have the other.
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

  -- Bishop and Secretary: ordained only.
  IF o.grants_role IN ('BISHOP','SECRETARY') THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — this post is open to Reverends only';
    ELSIF p.pastor_standing = 'RETIRED' THEN
      RETURN 'Retired pastors cannot stand for this post';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN 'Open to Reverends only — not yet ordained';
    END IF;
    RETURN NULL;
  END IF;

  -- Treasurer: a lay leader from an LCM congregation.
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

  -- A Dean: a Reverend from a congregation in that district.
  IF o.kind = 'DEAN' THEN
    IF p.pastor_standing IS NULL THEN
      RETURN 'No standing recorded — a Dean must be a Reverend';
    ELSIF p.pastor_standing <> 'REVEREND' THEN
      RETURN CASE WHEN p.pastor_standing = 'RETIRED'
                  THEN 'Retired pastors cannot serve as Dean'
                  ELSE 'A Dean must be a Reverend' END;
    END IF;

    -- Every district they are connected to, by membership or by serving.
    SELECT array_agg(DISTINCT c.district_id) INTO v_districts
      FROM congregations c
     WHERE c.district_id IS NOT NULL
       AND (
            c.id = p.congregation_id
         OR (
              -- Only when there is an address to match on at all; otherwise a
              -- congregation with a blank head pastor would match everybody.
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

  -- An EXCO seat: ministry or an LCM lay member, and never a retired pastor.
  IF o.kind = 'EXCO' THEN
    IF p.pastor_standing = 'RETIRED' THEN
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
