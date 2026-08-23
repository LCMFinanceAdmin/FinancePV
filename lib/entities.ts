// The bodies a voucher can be drawn on, and the account each is paid from.
//
// The stamp in the voucher's "For Office Use Only" box says which body and which
// bank a payment leaves. It was written out per body at each place a voucher is
// drawn — the submit form, the voucher page, the PDF — so BAM appeared in all
// three, LSC and HLE in one, and LGB in none. A body added next year would need
// finding in three files, and would be missed in two.
//
// One map, read by all three. The bank names match bank_accounts, which is where
// the paid archive gets them from (migrations 162 and 163).

export interface PvEntity {
  /** What the stamp reads — also the voucher number's prefix. */
  code: string;
  /** The account it is disbursed from. */
  bank: string;
  /** The body's name, for the header line above the title. */
  name: string;
  /** Set where the account is in another body's name — see migration 163. */
  registeredTo?: string;
}

export const PV_ENTITIES: Record<string, PvEntity> = {
  BAM: { code: "BAM", bank: "MAYBANK",     name: "Building Asset Management" },
  LSC: { code: "LSC", bank: "RHB",         name: "Luther Study Centre" },
  HLE: { code: "HLE", bank: "MAYBANK",     name: "Highlands Lakeview Enterprises Sdn. Bhd." },
  LGB: { code: "LGB", bank: "HONG LEONG",  name: "Lutheran Garden Berhad", registeredTo: "LCM" },
};

/** Null for LCM, whose vouchers carry no stamp — it is the default body. */
export const pvEntity = (pvType?: string | null): PvEntity | null =>
  pvType ? (PV_ENTITIES[pvType] ?? null) : null;
