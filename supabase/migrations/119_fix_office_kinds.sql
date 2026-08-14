-- 119: two posts filed under EXCO that are not EXCO seats.
--
-- Migration 113 moved the project committees out of EXCO Portfolios and named
-- them explicitly, precisely because reclassifying a post changes what its
-- holders appear to have been elected to. It matched on
--
--   'Education Desk', 'Finance and Development', 'Finance & Development'
--
-- and the register actually calls it "Finance and Development (F&D)". So the
-- UPDATE matched one row of two and reported success. That is the failure mode
-- of matching live data by name, and the reason this migration matches by
-- prefix instead — the suffix is exactly the part that varies.
--
-- Building Asset Management (BAM) is the second. It is a committee, not an
-- EXCO seat, and it was never in 113's list because nobody had said so yet.

UPDATE offices
   SET kind = 'PROJECT', tenure = 'TEMPORARY'
 WHERE kind = 'EXCO'
   AND name LIKE 'Finance and Development%';

-- A committee seats several people, so the one-holder rule stops applying —
-- the same thing the office form does when the kind is changed by hand.
UPDATE offices
   SET kind = 'COMMITTEE', tenure = 'PERMANENT', single_holder = FALSE
 WHERE kind = 'EXCO'
   AND name LIKE 'Building Asset Management%';

-- What is deliberately NOT changed here: what these posts grant. Both still
-- carry MINISTRY_HEAD, which is EXCO Member access. Filing a post correctly and
-- deciding what its holder may do in the system are different questions, and
-- the second is not mine to answer — it is a click on Edit post, "Gives access
-- as". Left visible rather than guessed at.
