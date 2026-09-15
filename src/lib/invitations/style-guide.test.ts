import assert from "node:assert/strict";
import test from "node:test";
import { normalizeInvitationStyleGuide } from "./style-guide";

test("normalizes an optional style note and labeled event colors", () => {
  assert.deepEqual(normalizeInvitationStyleGuide({
    note: "  Glamorous fascinators  ",
    colors: [{ name: "  Sage ", color: "#9ca58b" }],
  }), {
    note: "Glamorous fascinators",
    colors: [{ name: "Sage", color: "#9CA58B" }],
  });
});

test("empty style guidance is omitted", () => {
  assert.equal(normalizeInvitationStyleGuide({ note: "", colors: [] }), null);
});

test("rejects invalid and oversized style guidance", () => {
  assert.equal(normalizeInvitationStyleGuide({ note: null, colors: [{ name: "Sage", color: "green" }] }), null);
  assert.equal(normalizeInvitationStyleGuide({ note: "x".repeat(501), colors: [] }), null);
  assert.equal(normalizeInvitationStyleGuide({
    note: null,
    colors: Array.from({ length: 9 }, (_, index) => ({ name: `Color ${index}`, color: "#112233" })),
  }), null);
});

test("drops blank color rows but rejects partially populated rows", () => {
  assert.deepEqual(normalizeInvitationStyleGuide({
    note: "Black tie",
    colors: [{ name: "", color: "" }],
  }), { note: "Black tie", colors: [] });
  assert.equal(normalizeInvitationStyleGuide({
    note: null,
    colors: [{ name: "Petal", color: "" }],
  }), null);
});
