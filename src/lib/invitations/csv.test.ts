import assert from "node:assert/strict";
import test from "node:test";
import { responsesToCsv, type InvitationResponseCsvRow } from "./csv";

const row: InvitationResponseCsvRow = {
  attending: true,
  primaryName: "Ana Rivera",
  email: "ana@example.com",
  phone: "+19175550101",
  partySize: 2,
  additionalGuestNames: ["Luis Rivera"],
  dietaryOrAccessibilityNotes: "Wheelchair access",
  message: "Thank you",
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
};

test("CSV neutralizes spreadsheet formulas and quotes commas", () => {
  const csv = responsesToCsv([{ ...row, primaryName: "=1+1", message: "Thanks, see you" }]);

  assert.match(csv, /'\=1\+1/);
  assert.match(csv, /"Thanks, see you"/);
});

test("CSV neutralizes every formula prefix after preserving leading whitespace", () => {
  const csv = responsesToCsv([
    { ...row, primaryName: "+SUM(A1:A2)" },
    { ...row, primaryName: "-2+3" },
    { ...row, primaryName: "@cmd" },
    { ...row, primaryName: " =HYPERLINK(\"https://bad.test\")" },
  ]);

  for (const dangerous of ["'+SUM(A1:A2)", "'-2+3", "'@cmd", " '="]) {
    assert.match(csv, new RegExp(dangerous.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("CSV follows RFC 4180 for quotes, newlines, nulls, and CRLF rows", () => {
  const csv = responsesToCsv([{
    ...row,
    attending: false,
    email: null,
    phone: null,
    partySize: 0,
    additionalGuestNames: [],
    dietaryOrAccessibilityNotes: null,
    message: "She said \"yes\"\nthen declined",
  }]);

  assert.match(csv, /^Response status,Primary name,Email,Phone,Party size,Additional guests,Dietary or accessibility notes,Message,Created time,Updated time\r\n/);
  assert.match(csv, /Declined,Ana Rivera,,,0,,,"She said ""yes""\nthen declined"/);
  assert.equal(csv.endsWith("\r\n"), true);
});
