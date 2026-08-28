-- 184: the Secretary's routing, and the head pastor of 11th Mile Cheras.
--
-- Two facts from the church.
--
-- 1. David Ho Chee Way is head pastor of 11th Mile Cheras Lutheran Church.
--    That is worth recording for its own sake: every pastor of that
--    congregation routes their leave through the head pastor, and the field
--    was empty, so their applications were reaching only the Dean.
--
-- 2. The Secretary's own leave goes to the Bishop and to the Dean of his
--    district. It cannot come out of the ordinary pastoral rule, because that
--    rule sends a pastor to their head pastor — and he is the head pastor, so
--    the step drops out and leaves the council Chairman and the Dean. The
--    church wants the Bishop, not the council.
--
--    So this uses leave_approver_assignments, which the resolver checks first
--    and which exists precisely for people the rules do not describe. Written
--    against the office holder rather than the office: if the Secretary
--    changes, this row is what needs revisiting, and a row is easier to find
--    than a branch in code.

BEGIN;

-- 1. The head pastor.
UPDATE congregations
   SET head_pastor_email = 'secretary@lcm.org.my'
 WHERE lower(name) = lower('11th Mile Cheras Lutheran Church')
   AND COALESCE(head_pastor_email, '') = '';

-- 2. The Secretary's own chain: the Bishop, and his district's Dean.
DELETE FROM leave_approver_assignments WHERE employee_email = 'secretary@lcm.org.my';

INSERT INTO leave_approver_assignments (employee_email, approver_email, approver_name, sort_order)
SELECT 'secretary@lcm.org.my', u.email, u.full_name, 1
  FROM user_roles u WHERE u.role = 'BISHOP';

-- The Dean is read from the district his congregation sits in, so this follows
-- Settings rather than naming a person who may be replaced at the next election.
INSERT INTO leave_approver_assignments (employee_email, approver_email, approver_name, sort_order)
SELECT 'secretary@lcm.org.my', d.dean_email,
       COALESCE((SELECT ur.full_name FROM user_roles ur WHERE lower(ur.email) = lower(d.dean_email)),
                d.dean_email),
       2
  FROM congregations c
  JOIN districts d ON d.id = c.district_id
 WHERE lower(c.name) = lower('11th Mile Cheras Lutheran Church')
   AND COALESCE(d.dean_email, '') <> ''
   AND lower(d.dean_email) <> 'secretary@lcm.org.my';

-- The Dean holds no login, so user_roles cannot name him — only the directory
-- can. Without this the Secretary's form would offer to send his leave to an
-- email address rather than to a person.
UPDATE leave_approver_assignments a
   SET approver_name = COALESCE(NULLIF(p.full_name, ''), a.approver_name)
  FROM people p
 WHERE lower(COALESCE(p.user_email, '')) = lower(a.approver_email)
    OR lower(COALESCE(p.work_email, '')) = lower(a.approver_email);

SELECT (SELECT head_pastor_email FROM congregations
         WHERE lower(name) = lower('11th Mile Cheras Lutheran Church')) AS head_pastor,
       (SELECT string_agg(approver_name, ' + ' ORDER BY sort_order)
          FROM leave_approver_assignments WHERE employee_email = 'secretary@lcm.org.my')
         AS secretary_chain;

COMMIT;
