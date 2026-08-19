-- 140: the per-post approval limit goes.
--
-- Migration 122 added offices.approval_limit and ministry_approval_gate() so a
-- committee could be told "you may verify up to RM5,000 on one voucher, above
-- that it goes to the post you sit under". It was never used: every office
-- carried NULL, so the gate has been answering "no limit" to every voucher
-- since the day it shipped.
--
-- Removed rather than left dormant. A limit shown on a form nobody had filled
-- in read as a live control that happened to be blank, and the escalation path
-- it fed — a breach going up to the parent post — only ever existed to serve
-- it. Budget breaches, which are real and do fire, are refused outright; there
-- was never a case for the parent committee waving one of those through.
--
-- The edge function stopped calling the gate before this ran, so nothing is
-- left pointing at a function that no longer exists.

DROP FUNCTION IF EXISTS ministry_approval_gate(TEXT, NUMERIC);
DROP FUNCTION IF EXISTS ministry_approval_gate(TEXT, DECIMAL);

ALTER TABLE offices DROP CONSTRAINT IF EXISTS offices_approval_limit_positive;
ALTER TABLE offices DROP COLUMN IF EXISTS approval_limit;
