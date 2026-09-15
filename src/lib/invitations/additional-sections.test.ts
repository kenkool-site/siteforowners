import assert from "node:assert/strict";
import test from "node:test";
import { parseInvitationAdditionalSections } from "./additional-sections";

test("additional sections trim complete rows and preserve multiline content", () => {
  assert.deepEqual(parseInvitationAdditionalSections([
    { heading: "  Wedding Day Schedule ", content: " Wedding Ceremony @ 1pm\nCocktail @ 2:30pm " },
    { heading: "", content: "" },
    { heading: " Dress Code ", content: " Dressing Code " },
  ]), {
    ok: true,
    value: [
      { heading: "Wedding Day Schedule", content: "Wedding Ceremony @ 1pm\nCocktail @ 2:30pm" },
      { heading: "Dress Code", content: "Dressing Code" },
    ],
  });
});

test("additional sections reject incomplete rows and enforce count and length limits", () => {
  assert.equal(parseInvitationAdditionalSections([{ heading: "Schedule", content: "" }]).ok, false);
  assert.equal(parseInvitationAdditionalSections([{ heading: "", content: "Details" }]).ok, false);
  assert.equal(parseInvitationAdditionalSections(Array.from({ length: 9 }, (_, index) => ({ heading: `Section ${index}`, content: "Details" }))).ok, false);
  assert.equal(parseInvitationAdditionalSections([{ heading: "x".repeat(81), content: "Details" }]).ok, false);
  assert.equal(parseInvitationAdditionalSections([{ heading: "Schedule", content: "x".repeat(2001) }]).ok, false);
});
