-- 120: the second BAM, and what a committee post actually needs to grant.
--
-- "Building Asset Management (BAM)" and "BAM Committee" are the same body
-- recorded twice — a seed artefact. The first is now vacant and retired rather
-- than deleted, because retiring keeps whatever history it accumulated while
-- taking it off the working list. BAM Committee is the one that stays.
--
-- Its grant is cleared on the way out. A retired post that somebody reinstates
-- in two years should not silently hand out EXCO Member access because of how
-- it happened to be seeded.
UPDATE offices
   SET active = FALSE, grants_role = NULL
 WHERE kind = 'COMMITTEE'
   AND name LIKE 'Building Asset Management%';

-- ── What Education Desk and F&D grant is left as it is, on purpose ────────
--
-- The obvious reading of "these are not EXCO seats, so stop granting EXCO
-- Member" is wrong, and it took looking at what the role does to see why.
-- MINISTRY_HEAD is not only a seat on the EXCO — it is the right to verify a
-- ministry's own spending. A project committee that holds a budget line has to
-- verify what is spent against it, so its holder needs exactly that role.
--
-- The real defect was next door, in the election flow: it attached the
-- ministry to the holder only when the post was EXCO-kind, so electing someone
-- to Education Desk gave them the role with no ministry attached — EXCO Member
-- access over an empty queue, unable to verify the very thing they hold. That
-- is fixed in the page, keyed on the grant rather than the kind.
--
-- What remains imperfect is the label: MINISTRY_HEAD reads "EXCO Member"
-- everywhere, which is right for a portfolio and misleading for a project
-- committee. Renaming a role used across the whole app is a bigger decision
-- than this migration, and is left visible rather than done quietly.
