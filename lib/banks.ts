// ---------------------------------------------------------------------------
// The one bank list
//
// Before this file the app carried twelve separate bank tables: six dropdowns,
// five abbreviation maps for the printed voucher, and one SWIFT map for the
// payroll bank file. They disagreed — "CIMB" vs "CIMB Bank", "Agro Bank" vs
// "Agrobank", "OCBC" vs "OCBC Bank Malaysia" — so a bank added in one place
// went missing in the others, and the printed voucher showed a raw string
// whenever the spelling it was given was not the spelling it expected.
//
// Records already in the database are messier still: Maybank alone is stored
// four ways, and the most common value of all is "Malayan Banking Berhad",
// which appears in none of the old dropdowns. So matching here is deliberately
// forgiving: `aliases` carry the spellings actually found in the data, and
// `normaliseBankName` strips legal suffixes and the "Malaysia" that the local
// entity of a foreign bank sometimes carries. Nothing rewrites stored values —
// a name is resolved when it is read, and a form offers the value as recorded,
// so opening a record never quietly changes which bank it says.
//
// Every bank here is the Malaysian entity, so none of the names repeat it.
//
// BIC codes are only filled in where Finance had already verified them. A
// salary sent on a guessed BIC fails or goes astray, so the rest are left
// blank on purpose: the payroll export already reports a missing BIC as a
// problem, which is the right outcome until Finance supplies the code.
// ---------------------------------------------------------------------------

export type BankCategory =
  | "Commercial"
  | "Islamic"
  | "Development & savings"
  | "Digital"
  | "e-Wallet";

export type Bank = {
  /** Canonical name. New records store this. */
  name: string;
  /** Short form printed on the voucher. */
  abbr: string;
  /** SWIFT/BIC for the payroll bank file; absent where we have none on file. */
  bic?: string;
  category: BankCategory;
  /** Spellings seen in imported or legacy records. */
  aliases?: string[];
};

export const BANKS: Bank[] = [
  // --- Commercial -------------------------------------------------------
  { name: "Maybank", abbr: "MBB", bic: "MBBEMYKL", category: "Commercial",
    aliases: ["malayan banking", "mbb"] },
  { name: "CIMB Bank", abbr: "CIMB", bic: "CIBBMYKL", category: "Commercial",
    aliases: ["cimb"] },
  { name: "Public Bank", abbr: "PBB", bic: "PBBEMYKL", category: "Commercial",
    aliases: ["public bank public finance", "public bank pbb", "pbb", "public finance"] },
  { name: "RHB Bank", abbr: "RHB", bic: "RHBBMYKL", category: "Commercial",
    aliases: ["rhb"] },
  { name: "Hong Leong Bank", abbr: "HLB", bic: "HLBBMYKL", category: "Commercial",
    aliases: ["hong leong", "hlb"] },
  { name: "AmBank", abbr: "AMB", bic: "ARBKMYKL", category: "Commercial",
    aliases: ["am bank", "amb"] },
  { name: "Affin Bank", abbr: "AFFIN", bic: "PHBMMYKL", category: "Commercial",
    aliases: ["affin"] },
  { name: "Alliance Bank", abbr: "ABB", bic: "MFBBMYKL", category: "Commercial",
    aliases: ["alliance"] },
  { name: "OCBC Bank", abbr: "OCBC", bic: "OCBCMYKL", category: "Commercial",
    aliases: ["ocbc"] },
  { name: "HSBC Bank", abbr: "HSBC", bic: "HBMBMYKL", category: "Commercial",
    aliases: ["hsbc"] },
  { name: "Standard Chartered", abbr: "SCB", bic: "SCBLMYKX", category: "Commercial",
    aliases: ["standard chartered bank", "stanchart", "scb"] },
  { name: "UOB Bank", abbr: "UOB", bic: "UOVBMYKL", category: "Commercial",
    aliases: ["uob", "united overseas bank"] },
  { name: "Citibank", abbr: "CITI", category: "Commercial",
    aliases: ["citi"] },
  { name: "Bank of China", abbr: "BOC", category: "Commercial",
    aliases: ["boc"] },
  { name: "ICBC", abbr: "ICBC", category: "Commercial",
    aliases: ["industrial and commercial bank of china"] },

  // --- Islamic ----------------------------------------------------------
  // The Islamic arms are separate licensed banks rather than branches, so they
  // are listed in their own right and carry their own BIC.
  { name: "Maybank Islamic", abbr: "MBBI", category: "Islamic",
    aliases: ["maybank islamic bank"] },
  { name: "CIMB Islamic", abbr: "CIMBI", category: "Islamic",
    aliases: ["cimb islamic bank"] },
  { name: "Public Islamic Bank", abbr: "PIBB", category: "Islamic",
    aliases: ["public islamic"] },
  { name: "RHB Islamic Bank", abbr: "RHBI", category: "Islamic",
    aliases: ["rhb islamic"] },
  { name: "Hong Leong Islamic Bank", abbr: "HLIB", category: "Islamic",
    aliases: ["hong leong islamic"] },
  { name: "AmBank Islamic", abbr: "AMBI", category: "Islamic",
    aliases: ["ambank islamic bank", "am islamic"] },
  { name: "Affin Islamic Bank", abbr: "AFFINI", category: "Islamic",
    aliases: ["affin islamic"] },
  { name: "Alliance Islamic Bank", abbr: "ABBI", category: "Islamic",
    aliases: ["alliance islamic"] },
  { name: "OCBC Al-Amin", abbr: "OCBCI", category: "Islamic",
    aliases: ["ocbc al amin", "ocbc alamin"] },
  { name: "Standard Chartered Saadiq", abbr: "SCBI", category: "Islamic",
    aliases: ["saadiq"] },
  { name: "HSBC Amanah", abbr: "HSBCI", category: "Islamic",
    aliases: ["hsbc amanah bank"] },
  { name: "Bank Islam", abbr: "BIMB", bic: "BIMBMYKL", category: "Islamic",
    aliases: ["bimb"] },
  { name: "Bank Muamalat", abbr: "BMMB", bic: "BMMBMYKL", category: "Islamic",
    aliases: ["muamalat"] },
  { name: "Kuwait Finance House", abbr: "KFH", category: "Islamic",
    aliases: ["kfh"] },
  { name: "Al Rajhi Bank", abbr: "RAJHI", category: "Islamic",
    aliases: ["al rajhi", "alrajhi", "ar rajhi"] },
  { name: "MBSB Bank", abbr: "MBSB", bic: "MBSBMYKL", category: "Islamic",
    aliases: ["mbsb", "malaysia building society"] },

  // --- Development & savings -------------------------------------------
  { name: "Bank Rakyat", abbr: "BPR", bic: "BKRMMYKL", category: "Development & savings",
    aliases: ["bank kerjasama rakyat", "bkrm"] },
  { name: "Bank Simpanan Nasional (BSN)", abbr: "BSN", bic: "BSNAMYK1", category: "Development & savings",
    aliases: ["bank simpanan nasional", "bsn"] },
  { name: "Agrobank", abbr: "AGRO", bic: "AGOBMYKL", category: "Development & savings",
    aliases: ["agro bank", "bank pertanian"] },

  // --- Digital ----------------------------------------------------------
  // Licensed digital banks. Worth checking against Bank Negara's register
  // before relying on this set being complete.
  { name: "GX Bank", abbr: "GXB", category: "Digital", aliases: ["gxbank", "gx"] },
  { name: "AEON Bank", abbr: "AEON", category: "Digital", aliases: ["aeon"] },
  { name: "Boost Bank", abbr: "BOOSTB", category: "Digital" },
  { name: "KAF Digital Bank", abbr: "KAF", category: "Digital", aliases: ["kaf"] },
  { name: "Ryt Bank", abbr: "RYT", category: "Digital", aliases: ["ryt"] },

  // --- e-Wallet ---------------------------------------------------------
  // Reimbursements are sometimes sent to a wallet. Salaries are not, so these
  // are kept out of the payroll list.
  { name: "Touch 'n Go eWallet", abbr: "TNG", category: "e-Wallet",
    aliases: ["tng ewallet touch n go", "tng ewallet", "tng", "touch n go", "touch n go ewallet"] },
  { name: "Boost eWallet", abbr: "BOOST", category: "e-Wallet", aliases: ["boost"] },
  { name: "GrabPay", abbr: "GRAB", category: "e-Wallet", aliases: ["grab pay"] },
  { name: "ShopeePay", abbr: "SHOPEE", category: "e-Wallet", aliases: ["shopee pay"] },
];

/** The paying account. Transfers to the same bank clear intrabank, not IBG. */
export const HOME_BANK = "Public Bank";

const CATEGORY_ORDER: BankCategory[] = [
  "Commercial", "Islamic", "Development & savings", "Digital", "e-Wallet",
];

// Tokens that carry no meaning for telling one bank from another: company
// suffixes, and the "Malaysia" that a foreign bank's local entity adds.
const NOISE = new Set(["berhad", "bhd", "sdn", "malaysia", "msia"]);

/**
 * Reduce a bank name to something comparable: lower case, punctuation gone,
 * legal suffixes dropped. "Public Bank Berhad (PBB)" and "PUBLIC BANK" both
 * come out as something we can match.
 */
export function normaliseBankName(name: string | null | undefined): string {
  return (name || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(t => t && !NOISE.has(t))
    .join(" ");
}

const BY_KEY = new Map<string, Bank>();
for (const bank of BANKS) {
  for (const key of [bank.name, ...(bank.aliases ?? [])]) {
    const k = normaliseBankName(key);
    // First writer wins, so a canonical name is never shadowed by another
    // bank's alias.
    if (k && !BY_KEY.has(k)) BY_KEY.set(k, bank);
  }
}

/** The bank a stored name refers to, however it was spelled. */
export function findBank(name: string | null | undefined): Bank | undefined {
  if (!name) return undefined;
  return BY_KEY.get(normaliseBankName(name));
}

/** Short form for the printed voucher; the name itself if we don't know it. */
export function bankAbbr(name: string | null | undefined): string {
  return findBank(name)?.abbr ?? (name || "");
}

/** Verified BIC, or undefined — never a guess. */
export function bankBic(name: string | null | undefined): string | undefined {
  return findBank(name)?.bic;
}

/** Two spellings of the same bank. */
export function isSameBank(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = findBank(a), y = findBank(b);
  if (x && y) return x.name === y.name;
  const na = normaliseBankName(a), nb = normaliseBankName(b);
  return !!na && na === nb;
}

/** Does this account sit with the paying bank, so the transfer is intrabank? */
export function isHomeBank(name: string | null | undefined): boolean {
  return isSameBank(name, HOME_BANK);
}

export const BANK_NAMES: string[] = BANKS.map(b => b.name);

/** Banks a salary can be paid into — everything but the wallets. */
export const SALARY_BANK_NAMES: string[] = BANKS
  .filter(b => b.category !== "e-Wallet")
  .map(b => b.name);

export type BankOptionGroup = { label: string; names: string[] };

/**
 * Grouped options for a <select>.
 *
 * `current` is the value already on the record. When it isn't one of the
 * canonical names — an imported "Malayan Banking Berhad", say — it is offered
 * back as its own option, labelled with the bank it resolves to. Without that
 * the select would render as though no bank had been chosen, and saving the
 * form would quietly drop it.
 */
export function bankOptionGroups(
  current?: string | null,
  opts?: { includeWallets?: boolean },
): BankOptionGroup[] {
  const includeWallets = opts?.includeWallets ?? true;
  const groups: BankOptionGroup[] = [];

  if (current && !BANKS.some(b => b.name === current)) {
    const resolved = findBank(current);
    groups.push({
      label: resolved ? `As recorded (${resolved.name})` : "As recorded",
      names: [current],
    });
  }

  for (const category of CATEGORY_ORDER) {
    if (!includeWallets && category === "e-Wallet") continue;
    const names = BANKS.filter(b => b.category === category).map(b => b.name);
    if (names.length) groups.push({ label: category, names });
  }
  return groups;
}
