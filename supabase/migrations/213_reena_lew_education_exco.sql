-- 213: Reena Lew holds Education, not the desk under it.
--
-- 202 and 206 put her on the Education Desk. That was my reading of "the
-- education desk is held by Rev Reena Lew", and it was the wrong one: she has
-- charge of LCM's Education ministry as a whole, and the desk answers to that
-- portfolio rather than being it. Chan Mun Kwan keeps the desk, under her.
--
-- The order below is not arbitrary. 198's trigger clears ministries on any
-- MINISTRY_SUPPORT account on every write, so the role has to change before the
-- holding is recorded — record the holding first and ministries_follow_office
-- would write "Education" onto an account that still reads MINISTRY_SUPPORT,
-- and the trigger would wipe it in the same statement. That is exactly how her
-- portfolio came out empty twice yesterday.

-- 1. The role first, so the ministries written in step 3 survive.
UPDATE user_roles
   SET role = 'EXCO_EDUCATION', updated_at = NOW()
 WHERE email = 'reena.lew@lcm.org.my';

-- 2. Off the desk. Dated rather than deleted: she did hold it, briefly and on
--    paper, and an office register that quietly forgets is not a register.
UPDATE office_holdings h
   SET term_end = CURRENT_DATE,
       note = COALESCE(h.note || ' ', '') || 'Ended: holds the Education EXCO portfolio instead.'
  FROM offices o, people p
 WHERE o.id = h.office_id AND p.id = h.person_id
   AND o.name = 'Education Desk' AND p.full_name = 'Lew Nyak Jin (Reena)'
   AND h.term_end IS NULL;

-- 3. Onto the portfolio. The trigger reads the office name, finds the ministry
--    of the same name and adds it to her account; Education and Education Desk
--    are linked in both directions, so this covers the desk's spending too.
INSERT INTO office_holdings (office_id, person_id, term_start, elected_on, note)
SELECT o.id, p.id, CURRENT_DATE, CURRENT_DATE,
       'Recorded from the General Manager''s instruction, 12 September 2026.'
  FROM offices o, people p
 WHERE o.name = 'Education' AND o.kind = 'EXCO'
   AND p.full_name = 'Lew Nyak Jin (Reena)'
   AND NOT EXISTS (
     SELECT 1 FROM office_holdings h
      WHERE h.office_id = o.id AND h.person_id = p.id AND h.term_end IS NULL);

-- 4. The delegation 206 gave her is now redundant and would be misleading: a
--    named representative is what somebody is given instead of a portfolio, and
--    she has the portfolio. Chan's stays, scoped to his one budget line.
UPDATE ministry_verifiers v
   SET active = FALSE, ends_on = CURRENT_DATE
  FROM people p
 WHERE p.id = v.person_id
   AND p.full_name = 'Lew Nyak Jin (Reena)'
   AND lower(v.ministry) = 'education'
   AND v.active;

SELECT (SELECT u.role::text || '  ' || COALESCE(u.ministries::text,'{}')
          FROM user_roles u WHERE u.email='reena.lew@lcm.org.my')                        AS reena,
       (SELECT u.role::text || '  ' || COALESCE(u.ministries::text,'{}')
          FROM user_roles u WHERE u.email='educationdesk@lcm.org.my')                    AS chan,
       (SELECT COALESCE(string_agg(p.full_name,', '),'(vacant)') FROM office_holdings h
          JOIN offices o ON o.id=h.office_id JOIN people p ON p.id=h.person_id
         WHERE o.name='Education' AND o.kind='EXCO' AND h.term_end IS NULL)              AS education_exco,
       (SELECT COALESCE(string_agg(p.full_name,', '),'(vacant)') FROM office_holdings h
          JOIN offices o ON o.id=h.office_id JOIN people p ON p.id=h.person_id
         WHERE o.name='Education Desk' AND h.term_end IS NULL)                           AS education_desk,
       is_delegated_verifier('reena.lew@lcm.org.my','Education','Lay Leaders Training')  AS reena_any_line,
       is_delegated_verifier('educationdesk@lcm.org.my','Education','Education Desk Project') AS chan_his_line,
       is_delegated_verifier('educationdesk@lcm.org.my','Education','Lay Leaders Training')   AS chan_other_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'],'Lay Leaders Training')  AS education_covered,
       ministry_has_verifier(ARRAY['Education Desk'],'Education Desk Project')            AS desk_covered;
