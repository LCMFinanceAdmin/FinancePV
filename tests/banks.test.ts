// Which bank a stored name refers to.
//
// The app used to carry twelve separate bank tables — six dropdowns, five
// abbreviation maps for the printed voucher, one SWIFT map for the payroll
// file — and they disagreed about what each bank was called. The records are
// less tidy than any of them: 29 distinct spellings for about fourteen banks,
// the commonest being "Malayan Banking Berhad", which no dropdown ever
// offered. So these tests are mostly about the spellings in the real data,
// because that is what the one list has to understand.
import test from "node:test";
import assert from "node:assert/strict";
import {
  BANKS, BANK_NAMES, SALARY_BANK_NAMES, HOME_BANK,
  findBank, bankAbbr, bankBic, isSameBank, isHomeBank,
  normaliseBankName, bankOptionGroups,
} from "@/lib/banks";

// Every spelling held in the twelve bank-name columns, with the bank it means.
// Taken from the database, not invented: the counts are the rows behind each.
const STORED: [string, number, string | null][] = [
  ["Malayan Banking Berhad", 43, "Maybank"],
  ["Maybank", 28, "Maybank"],
  ["Public Bank Bhd / Public Finance", 16, "Public Bank"],
  ["Public Bank", 8, "Public Bank"],
  ["CIMB Bank Berhad", 5, "CIMB Bank"],
  ["Alliance Bank", 4, "Alliance Bank"],
  ["Bank Simpanan Nasional Berhad", 4, "Bank Simpanan Nasional (BSN)"],
  ["Hong Leong Bank Bhd", 4, "Hong Leong Bank"],
  ["Public Bank Berhad (PBB)", 4, "Public Bank"],
  ["RHB", 4, "RHB Bank"],
  ["RHB Bank", 4, "RHB Bank"],
  ["CIMB Bank", 3, "CIMB Bank"],
  ["Affin Bank", 2, "Affin Bank"],
  ["Hong Leong Bank", 2, "Hong Leong Bank"],
  ["MayBank Islamic Berhad", 2, "Maybank Islamic"],
  ["PUBLIC BANK", 2, "Public Bank"],
  ["Agro Bank", 1, "Agrobank"],
  ["Agrobank", 1, "Agrobank"],
  ["Alliance Bank Berhad", 1, "Alliance Bank"],
  ["Bank Kerjasama Rakyat Berhad", 1, "Bank Rakyat"],
  ["Bank Simpanan Nasional (BSN)", 1, "Bank Simpanan Nasional (BSN)"],
  ["CIMB", 1, "CIMB Bank"],
  ["HSBC Amanah Malaysia Berhad", 1, "HSBC Amanah"],
  ["MAYBANK", 1, "Maybank"],
  ["OCBC Bank", 1, "OCBC Bank"],
  ["Public Islamic Bank Bhd", 1, "Public Islamic Bank"],
  ["RHB Bank Berhad", 1, "RHB Bank"],
  ["Standard Chartered", 1, "Standard Chartered"],
  // Somebody typed the payment method into the bank field. It is not a bank
  // and must not be made to look like one.
  ["Transfer", 1, null],
];

test("every spelling in the records resolves to the bank it means", () => {
  for (const [stored, , expected] of STORED) {
    assert.equal(findBank(stored)?.name ?? null, expected, stored);
  }
});

test("the spellings the twelve old tables used all still resolve", () => {
  // Anything a dropdown once wrote is in the records somewhere, so dropping
  // one of these would strand the vouchers that carry it.
  const old = [
    "Maybank", "CIMB", "Public Bank", "RHB", "Hong Leong Bank", "AmBank", "Bank Islam",
    "Bank Rakyat", "OCBC", "Standard Chartered", "Affin Bank", "Alliance Bank", "UOB", "BSN",
    "CIMB Bank", "RHB Bank", "Bank Simpanan Nasional (BSN)", "OCBC Bank", "HSBC Bank",
    "UOB Bank", "Bank Muamalat", "Agrobank", "MBSB Bank", "OCBC Bank Malaysia",
    "Standard Chartered Malaysia", "HSBC Bank Malaysia", "UOB Malaysia", "Agro Bank",
    "Citibank Malaysia", "Kuwait Finance House Malaysia", "Al Rajhi Bank Malaysia",
    "Bank of China (Malaysia)", "ICBC Malaysia", "TNG eWallet (Touch 'n Go)", "Boost",
    "GrabPay", "ShopeePay",
  ];
  for (const name of old) assert.ok(findBank(name), name);
});

test("a name is matched past case, spacing, punctuation and company suffix", () => {
  for (const typed of ["RHB Bank", "rhb bank", "  RHB  Bank ", "RHB Bank Berhad", "RHB Bank Bhd."]) {
    assert.equal(findBank(typed)?.name, "RHB Bank", typed);
  }
  // "Malaysia" is how a foreign bank names its local entity; every bank here
  // is the Malaysian one, so it never tells two of them apart.
  assert.equal(findBank("HSBC Bank Malaysia")?.name, "HSBC Bank");
  assert.equal(findBank("UOB Malaysia")?.name, "UOB Bank");
});

test("an unknown name stays unknown rather than being forced onto a bank", () => {
  assert.equal(findBank("Transfer"), undefined);
  assert.equal(findBank(""), undefined);
  assert.equal(findBank(null), undefined);
  assert.equal(normaliseBankName("Berhad Bhd"), "");
});

test("the staff banking with the paying bank are paid intrabank", () => {
  // The old export compared the stored name to "Public Bank" exactly, so a
  // record spelling it any other way went out as IBG — dearer, and a day
  // later — though the account is with the paying bank itself. Of the 30 such
  // records, 29 were spelled some other way; 16 of them are payroll.
  const atHomeBank = STORED.filter(s => s[2] === HOME_BANK);
  assert.equal(atHomeBank.reduce((n, s) => n + s[1], 0), 30);
  for (const [stored] of atHomeBank) assert.ok(isHomeBank(stored), stored);

  const missedByExactMatch = atHomeBank
    .filter(([stored]) => stored !== HOME_BANK)
    .reduce((n, s) => n + s[1], 0);
  assert.equal(missedByExactMatch, 22);
});

test("an Islamic arm is its own bank, not its parent", () => {
  // They are separately licensed, so folding one into its parent would send a
  // transfer to the wrong institution.
  assert.ok(!isHomeBank("Public Islamic Bank"));
  assert.ok(!isSameBank("Maybank", "Maybank Islamic"));
  assert.ok(!isSameBank("HSBC Bank", "HSBC Amanah"));
  assert.ok(!isSameBank("Boost Bank", "Boost eWallet"));
});

test("a BIC is only given where one was on file, never guessed", () => {
  // A salary sent on a wrong BIC fails or goes astray. The export reports a
  // blank as a problem, which is what should happen until Finance supplies it.
  assert.equal(bankBic("Malayan Banking Berhad"), "MBBEMYKL");
  assert.equal(bankBic("Public Bank Bhd / Public Finance"), "PBBEMYKL");
  assert.equal(bankBic("Transfer"), undefined);
  for (const name of ["Maybank Islamic", "HSBC Amanah", "Public Islamic Bank", "GX Bank"]) {
    assert.equal(bankBic(name), undefined, name);
  }
  for (const bank of BANKS) {
    if (bank.bic) assert.match(bank.bic, /^[A-Z0-9]{8}$/, bank.name);
  }
});

test("the voucher prints the short form, whatever the record says", () => {
  assert.equal(bankAbbr("Malayan Banking Berhad"), "MBB");
  assert.equal(bankAbbr("Public Bank Bhd / Public Finance"), "PBB");
  assert.equal(bankAbbr("OCBC Bank Malaysia"), "OCBC");
  // An unknown name prints as it stands, so nothing disappears from a voucher
  // just because we do not recognise the bank.
  assert.equal(bankAbbr("Transfer"), "Transfer");
  assert.equal(bankAbbr(""), "");
});

test("the banks asked for are present", () => {
  for (const want of [
    "GX Bank", "HSBC Bank", "HSBC Amanah", "Touch 'n Go eWallet",
    "Maybank Islamic", "CIMB Islamic", "Public Islamic Bank", "RHB Islamic Bank",
    "Hong Leong Islamic Bank", "AmBank Islamic", "Affin Islamic Bank",
    "Alliance Islamic Bank", "OCBC Al-Amin", "Standard Chartered Saadiq",
  ]) assert.ok(BANK_NAMES.includes(want), want);
});

test("no bank is listed twice and no alias is claimed by two banks", () => {
  assert.deepEqual(BANK_NAMES.filter((n, i) => BANK_NAMES.indexOf(n) !== i), []);
  const seen = new Map<string, string>();
  for (const bank of BANKS) {
    for (const key of [bank.name, ...(bank.aliases ?? [])]) {
      const k = normaliseBankName(key);
      const owner = seen.get(k);
      assert.ok(!owner || owner === bank.name, `"${key}" claimed by ${owner} and ${bank.name}`);
      seen.set(k, bank.name);
    }
  }
});

test("a wallet can take a reimbursement but not a salary", () => {
  assert.ok(BANK_NAMES.includes("Touch 'n Go eWallet"));
  assert.ok(!SALARY_BANK_NAMES.includes("Touch 'n Go eWallet"));
  assert.ok(!SALARY_BANK_NAMES.includes("GrabPay"));
  assert.ok(SALARY_BANK_NAMES.includes("Maybank"));
});

test("a form offers back the bank the record already names", () => {
  // Otherwise a select whose value is an imported spelling renders as though
  // no bank had been chosen, and saving the form would drop it.
  const groups = bankOptionGroups("Malayan Banking Berhad");
  assert.equal(groups[0].label, "As recorded (Maybank)");
  assert.deepEqual(groups[0].names, ["Malayan Banking Berhad"]);

  // A value we cannot place is still offered, unlabelled — it is somebody's
  // record either way.
  assert.equal(bankOptionGroups("Transfer")[0].label, "As recorded");

  // A canonical name needs no such group, and neither does an empty field.
  assert.ok(!bankOptionGroups("Maybank")[0].label.startsWith("As recorded"));
  assert.ok(!bankOptionGroups("")[0].label.startsWith("As recorded"));
  assert.ok(!bankOptionGroups(null)[0].label.startsWith("As recorded"));
});

test("the salary form offers no wallets but keeps the recorded value", () => {
  const groups = bankOptionGroups("MayBank Islamic Berhad", { includeWallets: false });
  assert.equal(groups[0].names[0], "MayBank Islamic Berhad");
  assert.ok(!groups.some(g => g.label === "e-Wallet"));
  assert.ok(bankOptionGroups("Maybank").some(g => g.label === "e-Wallet"));
});
