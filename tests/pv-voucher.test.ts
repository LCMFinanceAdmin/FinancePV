// What the payment voucher says, and for whom.
//
// The rendered HTML is the document people sign and file, so the questions
// here are about what appears on it: whose signature is asked for, whose is
// not, and what the boxes are called.
import test from "node:test";
import assert from "node:assert/strict";
import { pvPrintHtml } from "@/components/pv/pv-html";
import { isHqOffice } from "@/lib/ministries";
import type { PV } from "@/lib/types";

const voucher = (o: Partial<PV> = {}): string => pvPrintHtml({
  id: "1", pv_no: "PV-TEST-0001", pv_type: "LCM", status: "PENDING_HEAD",
  applicant_name: "Jermaine Aaron", payee_name: "Thomas Lim",
  project: "Orang Asli", purpose: "Transportation",
  items: [{ description: "Fuel", amount: 222 }], amount: 222,
  submitted_at: "2026-09-23T00:00:00Z", submitted_by: "Jermaine Aaron",
  approvals: [], attachments: [], ministry_verified: "N", head_verified: "",
  ministry: "Orang Asli",
  ...o,
} as unknown as PV);

const EXCO_BOX = "By EXCO Member / Dept Head in Charge";

test("the Finance Office box says what the person did", () => {
  // "Prepared by" is not what a Finance Executive does to a claim somebody
  // else raised.
  const html = voucher();
  assert.ok(html.includes("Reviewed by:"));
  assert.ok(!html.includes("Prepared by:"));
});

test("an ordinary ministry voucher asks the EXCO to verify, and a checker to check", () => {
  const html = voucher();
  assert.ok(html.includes(EXCO_BOX), "the EXCO's box is there");
  assert.ok(html.includes("Checked by:"), "and the checker's beside it");
  assert.ok(html.includes("Appointed by the EXCO Member"), "which says where that authority comes from");
});

test("HQ office expenses answer to no EXCO, so neither box appears", () => {
  // There is no committee above the office. Printing a box nobody is placed to
  // sign invites somebody to wonder who should — or to sign it.
  for (const ministry of ["HQ", "Head Quarters (HQ)", "LCM HQ Office", "  lcm hq office  "]) {
    const html = voucher({ ministry });
    assert.ok(!html.includes(EXCO_BOX), `${ministry}: no EXCO box`);
    assert.ok(!html.includes("Checked by:"), `${ministry}: no checker's box either`);
    assert.ok(html.includes("Reviewed by:"), `${ministry}: still reviewed by Finance`);
  }
});

test("the three spellings of HQ are recognised, and nothing else is", () => {
  assert.ok(isHqOffice("HQ"));
  assert.ok(isHqOffice("head quarters (hq)"), "matching ignores case and spacing");
  assert.ok(isHqOffice(" LCM HQ Office "));
  assert.ok(!isHqOffice("Orang Asli"));
  assert.ok(!isHqOffice(""));
  assert.ok(!isHqOffice(null));
});

test("the office reference is what Finance entered, not the system's own number", () => {
  // The box used to fall back to pv_no, so a voucher nobody had referenced
  // still printed one — the number this system allocated to itself, which is
  // not the sequence the church files under.
  const entered = voucher({ office_ref: "PV/2026/0417", accounting_code: "6000-1234" } as Partial<PV>);
  assert.ok(entered.includes("Ref: <b>PV/2026/0417</b>"));
  assert.ok(entered.includes("A/C Code: <b>6000-1234</b>"));

  // The box, specifically. pv_no still appears in the document title, which is
  // the print filename and how a saved voucher is found again.
  const blank = voucher({ pv_no: "LCM-2026-0099" } as Partial<PV>);
  assert.ok(blank.includes("Ref: <b></b>"),
    "an unreferenced voucher prints the box empty rather than the system's number");
  assert.ok(blank.includes("<title>LCM-2026-0099"), "but the file is still named for it");
});

test("a voucher that has been checked names who checked it, and when", () => {
  const html = voucher({
    checked_by_name: "Thomas Lim",
    checked_at: "2026-09-24T02:00:00Z",
  } as Partial<PV>);
  assert.ok(html.includes("Thomas Lim"));
  assert.ok(html.includes("24/09/2026"));
});

test("the voucher names the budget line it is expensed from", () => {
  // It used to read "Project: Orang Asli / HQ / Transportation" -- one field
  // shaped like a path, leaving the reader to work out which part of it is the
  // budget item. The signatories asked for the budget item to be named, and on
  // the filed copy that means a field of its own.
  const html = voucher({ ministry: "Mission", dept: "HQ", project: "Vietnam 5" });
  assert.ok(html.includes("Ministry:  Mission / HQ"));
  assert.ok(html.includes("Budget line:  <b>Vietnam 5</b>"));
  assert.ok(!html.includes("Project:  Mission"));
});

test("a voucher drawn against no budget line leaves the field empty, not absent", () => {
  // A blank where a line should be is a question somebody can answer. No field
  // at all is not.
  const html = voucher({ ministry: "Mission", dept: "HQ", project: null });
  assert.ok(html.includes("Budget line:  <b>—</b>"));
});
