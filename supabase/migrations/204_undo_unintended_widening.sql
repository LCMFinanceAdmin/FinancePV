-- 204: put back a widening nobody asked for.
--
-- 203 reconciled every current office holding against its account, and caught
-- two. Reena Lew's was the point of the exercise. The second was Chan Mun
-- Kwan's, and it should not stand.
--
-- He holds the Education Desk project office, so by 197's rule the office
-- implies the Education Desk portfolio — and through the parent link that is
-- the whole of Education. But 198 deliberately narrowed him to one budget line,
-- Education Desk Project, as a named representative rather than a portfolio
-- holder. The narrow scope is the decision that was actually made about him;
-- the wide one is a consequence of 197 finally reaching a holding it had been
-- silently missing since the day it was written.
--
-- So his account goes back to carrying no portfolio, and his authority stays
-- where 198 put it: the delegation in ministry_verifiers, scoped to the one
-- line. Nothing he could do yesterday has changed.
--
-- Left standing for the General Manager to settle: he still holds the Education
-- Desk office in Settings, alongside Reena Lew, whom the church has since put
-- there. If he has handed over, ending his term is the honest record — but that
-- is a fact about the church, not something to infer from a migration.

UPDATE user_roles
   SET ministries = ARRAY[]::TEXT[], updated_at = NOW()
 WHERE email = 'educationdesk@lcm.org.my'
   AND ministries @> ARRAY['Education Desk'];

SELECT (SELECT COALESCE(ministries::text,'{}') FROM user_roles WHERE email='educationdesk@lcm.org.my') AS chan,
       (SELECT COALESCE(ministries::text,'{}') FROM user_roles WHERE email='reena.lew@lcm.org.my')     AS reena,
       (SELECT COALESCE(ministries::text,'{}') FROM user_roles WHERE email='stewardship@lcm.org.my')   AS gina,
       (SELECT COALESCE(ministries::text,'{}') FROM user_roles WHERE email='eric.mau@lcm.org.my')      AS eric,
       is_delegated_verifier('rev.chanmk@gmail.com', 'Education', 'Education Desk Project') AS chan_still_covers_his_line,
       is_delegated_verifier('rev.chanmk@gmail.com', 'Education', 'Lay Leaders Training')   AS chan_other_line,
       ministry_has_verifier(ARRAY['Education','Education Desk'], 'Lay Leaders Training')   AS edu_other_line,
       ministry_has_verifier(ARRAY['Stewardship'])                                          AS stewardship;
