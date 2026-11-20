// The yearly sheet's colours, for the screen and for the printed statement.
//
// One colour per kind of column, and the four statutory schemes share theirs.
// PCB, EPF, SOCSO and EIS are all money the law takes and LCM remits, so they
// read as one band; what separates them is the rule between them rather than
// a different hue each. SKBBK sits a shade down inside that band — filed on
// the same PERKESO return as SOCSO, reconciled as its own figure.
//
// Gross, net and the church's cost get their own, because those are the three
// figures anybody is actually looking for.
//
// Here rather than in either file because both need the same values and only
// one of them can use Tailwind: @react-pdf takes plain hex. Two copies of a
// colour that must agree is what a constant is for, and they had already
// drifted apart once.

export const SHEET = {
  /** The spine of the table. Also the rule between schemes. */
  month: "#44403c",
  /** What was earned, and what every scheme is worked out on. */
  gross: "#2f5b9c",
  /** PCB, EPF, SOCSO, EIS — one band. */
  stat: "#0f766e",
  /** Inside that band, a shade down. */
  skbbk: "#115e59",
  /** What reaches the employee. */
  net: "#6d28d9",
  /** What it costs the church. */
  lcm: "#1e293b",
  /** EPL, PTPTN, unpaid leave, and any custom deduction. */
  deduct: "#991b1b",
  /** Any custom allowance. */
  allow: "#166534",
} as const;
