-- 015: Rename seeded Finance Admin display names to Finance Executive
-- The internal role codes (FINANCE_ADMIN, FINANCE_ADMIN_2, FINANCE_ADMIN_3) are
-- unchanged — they appear in the DB as stored values and must stay for historical
-- approval records. Only the human-readable full_name is corrected here.

UPDATE user_roles
SET full_name = 'Finance Executive'
WHERE email = 'finance@lcm.org.my'
  AND full_name = 'Finance Admin';

UPDATE user_roles
SET full_name = 'Accounts Executive'
WHERE email = 'finance2@lcm.org.my'
  AND full_name = 'Finance Admin 2';

UPDATE user_roles
SET full_name = 'Finance Executive 3'
WHERE email = 'finance3@lcm.org.my'
  AND full_name = 'Finance Admin 3';
