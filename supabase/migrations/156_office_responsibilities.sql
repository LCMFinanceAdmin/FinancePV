-- 156: what a post is actually for.
--
-- The register says what every post is called, how long it is held, and what
-- system access it carries — and nothing at all about what the person holding
-- it decides. "EXCO — Stewardship" tells somebody who already knows what
-- stewardship covers; to everyone else it is a label.
--
-- That matters most at the two moments the register is used: choosing who to
-- put forward for a post, and working out which post a decision belongs to.
-- Both are questions about scope, and neither could be answered from here.
--
-- Free text rather than a structured list of duties. A constitution describes
-- these in sentences, and forcing them into rows would mean rewriting them into
-- a shape the church did not choose.
ALTER TABLE offices ADD COLUMN IF NOT EXISTS responsibilities TEXT;

COMMENT ON COLUMN offices.responsibilities IS
  'What the post covers — the decisions it carries and the part of the ministry it answers for. Shown on the register and when putting somebody forward.';
