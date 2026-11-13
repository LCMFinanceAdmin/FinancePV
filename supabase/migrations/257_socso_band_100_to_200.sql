-- The RM100–200 contribution band, as PERKESO actually publishes it.
--
-- PERKESO's Act 4 schedule breaks that range in two — "exceeding RM100 but not
-- exceeding RM140", then "exceeding RM140 but not exceeding RM200" — and the
-- table loaded here held a single RM100–200 band instead. Its figures match
-- neither row: they are 1.75% / 0.5% / 1.25% / 0.75% of a RM150 midpoint,
-- which is to say they were worked out rather than copied off the schedule.
--
-- Every other band in the table, both years, matches PERKESO exactly — 236
-- figures checked against the published schedule, this one band apart. So this
-- is a transcription gap, not a disagreement about rates.
--
-- Nobody on the payroll earns in this range (the lowest salary is RM300), so
-- no figure anybody has been paid changes. It is fixed because a salary that
-- lands here later would be over-deducted on all four figures, and because a
-- rate table that is right except in one place is harder to trust than one
-- that is right.
--
-- SKBBK is nil for 2025: the Non-Employment Injury Scheme (Lindung 24) began
-- in June 2026, and a figure in the 2025 row would reach back to a year it was
-- never deducted in.
--
-- EIS is the one column not taken from the schedule. PERKESO publishes EIS
-- under Act 800, whose rate sheet is a scanned image we cannot read, so these
-- two rows carry 0.2% of the band midpoint — which is what every other row in
-- this table comes to, exactly, at every midpoint. It is never used: EIS stops
-- at the RM100 floor of this band and nobody earns below RM300.
--
-- Safe to re-run: the first statement narrows the existing row, the rest
-- upsert on (year, wage_from).

begin;

-- The existing RM100–200 row becomes PERKESO's RM100–140 row. Updated in
-- place rather than deleted and reinserted, so nothing that holds its id
-- loses it.
update payroll_contribution_bands
   set wage_to         = 140,
       socso_er        = 2.10,
       socso_ee        = 0.60,
       socso_er_over60 = 1.50,
       skbbk           = case when year >= 2026 then 0.90 else 0 end,
       eis             = 0.24
 where wage_from = 100
   and year in (2025, 2026);

-- PERKESO's RM140–200 row, which the table never had.
insert into payroll_contribution_bands
  (year, wage_from, wage_to, socso_er, socso_ee, socso_er_over60, skbbk, eis)
values
  (2025, 140, 200, 2.95, 0.85, 2.10, 0,    0.34),
  (2026, 140, 200, 2.95, 0.85, 2.10, 1.25, 0.34)
on conflict (year, wage_from) do update
  set wage_to         = excluded.wage_to,
      socso_er        = excluded.socso_er,
      socso_ee        = excluded.socso_ee,
      socso_er_over60 = excluded.socso_er_over60,
      skbbk           = excluded.skbbk,
      eis             = excluded.eis;

commit;
