-- 202: three appointments, and one identity moved to its proper address.
--
-- The rule the General Manager gave: somebody employed by LCM signs in as
-- themselves, firstname.lastname@lcm.org.my. Somebody who holds a portfolio
-- without being employed signs in as the office, stewardship@lcm.org.my, since
-- they still need an account to have a role here at all.
--
-- Nothing below removes anything. Education Desk permits more than one holder,
-- so Reena Lew is added beside Chan Mun Kwan rather than over him; whether he
-- stands down is the church's decision, not a side effect of this file.

-- ── 1. Eric Mau moves to his own address ─────────────────────────────────
-- He is on LCM payroll, so by the rule above he is eric.mau@lcm.org.my, not
-- the Mission office account. The people record is updated in step, because
-- ministries_follow_office() matches a holding to an account by user_email and
-- work_email — leave it pointing at the old address and his Mission portfolio
-- would stop following his office.
UPDATE user_roles SET email = 'eric.mau@lcm.org.my', updated_at = NOW()
 WHERE email = 'mission@lcm.org.my';

UPDATE people SET user_email = 'eric.mau@lcm.org.my'
 WHERE lower(user_email) = 'mission@lcm.org.my';

-- Two notifications were addressed to the office account, one of them the
-- PR-2026-002 verification request that has been unread since 4 August. Left
-- behind they would be unreachable from any account.
UPDATE notifications SET recipient_email = 'eric.mau@lcm.org.my'
 WHERE recipient_email = 'mission@lcm.org.my';

-- ── 2. Rev Reena Lew, Education Desk ─────────────────────────────────────
-- Lew Nyak Jin (Reena) in the directory; on payroll, so her own address.
INSERT INTO user_roles (email, full_name, role, is_authorized)
SELECT 'reena.lew@lcm.org.my', 'Rev Reena Lew', 'MINISTRY_SUPPORT', TRUE
 WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE email = 'reena.lew@lcm.org.my');

-- The holding is what grants the portfolio: ministries_follow_office() reads
-- the office name, finds the ministry of the same name, and adds it to her
-- account. Education Desk and Education are linked in both directions, so this
-- covers Education's spending too.
INSERT INTO office_holdings (office_id, person_id, term_start, elected_on, note)
SELECT o.id, p.id, CURRENT_DATE, CURRENT_DATE,
       'Recorded from the General Manager''s instruction, 11 September 2026.'
  FROM offices o, people p
 WHERE o.name = 'Education Desk' AND o.kind = 'PROJECT'
   AND p.full_name = 'Lew Nyak Jin (Reena)'
   AND NOT EXISTS (
     SELECT 1 FROM office_holdings h
      WHERE h.office_id = o.id AND h.person_id = p.id AND h.term_end IS NULL);

-- ── 3. Gina Phan, Stewardship ────────────────────────────────────────────
-- Not employed by LCM and not in the directory, which is consistent — the
-- directory is people LCM has a record of, and she is none of its categories.
-- So there is no person to hang an office holding on, and the portfolio is set
-- on the account directly. is_lcm_staff derives to false on its own (192), and
-- 191 therefore gives her no claim or leave entitlement, which is right.
INSERT INTO user_roles (email, full_name, role, ministries, is_authorized)
SELECT 'stewardship@lcm.org.my', 'Gina Phan', 'EXCO_STEWARDSHIP', ARRAY['Stewardship'], TRUE
 WHERE NOT EXISTS (SELECT 1 FROM user_roles WHERE email = 'stewardship@lcm.org.my');

UPDATE user_roles
   SET ministries = ARRAY['Stewardship'], role = 'EXCO_STEWARDSHIP', updated_at = NOW()
 WHERE email = 'stewardship@lcm.org.my'
   AND NOT ('Stewardship' = ANY (COALESCE(ministries, ARRAY[]::TEXT[])));

SELECT (SELECT email || ' | ' || role::text || ' | ' || COALESCE(ministries::text,'{}')
          FROM user_roles WHERE email='eric.mau@lcm.org.my')    AS eric,
       (SELECT email || ' | ' || role::text || ' | ' || COALESCE(ministries::text,'{}')
          FROM user_roles WHERE email='reena.lew@lcm.org.my')   AS reena,
       (SELECT email || ' | ' || role::text || ' | ' || COALESCE(ministries::text,'{}')
          FROM user_roles WHERE email='stewardship@lcm.org.my') AS gina,
       (SELECT count(*) FROM user_roles WHERE email='mission@lcm.org.my')       AS old_mission_row,
       (SELECT count(*) FROM notifications WHERE recipient_email='mission@lcm.org.my') AS orphaned_notifs,
       ministry_has_verifier(ARRAY['Stewardship'])                              AS stewardship_covered,
       ministry_has_verifier(ARRAY['Education','Education Desk'], 'Lay Leaders Training') AS edu_other_line,
       ministry_has_verifier(ARRAY['Mission'])                                  AS mission_covered;
