import assert from "node:assert/strict";
import test from "node:test";
import { parseInvitespotLead } from "./invitespot-lead";

function validBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Chidinma O.",
    email: "chidinma@example.com",
    phone: "",
    eventType: "birthday",
    roughDate: "March",
    guestCount: 300,
    referralSlug: "mercy-john-lx9cwn",
    ...overrides,
  };
}

test("parses a valid lead with email only", () => {
  const result = parseInvitespotLead(validBody());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value, {
    name: "Chidinma O.",
    email: "chidinma@example.com",
    phone: "",
    eventType: "birthday",
    roughDate: "March",
    guestCount: 300,
    referralSlug: "mercy-john-lx9cwn",
  });
});

test("parses a valid lead with phone only, no email", () => {
  const result = parseInvitespotLead(validBody({ email: "", phone: "+1 555 000 0000" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.email, "");
  assert.equal(result.value.phone, "+1 555 000 0000");
});

test("rejects when both email and phone are blank", () => {
  const result = parseInvitespotLead(validBody({ email: "", phone: "" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /email or phone/i);
});

test("rejects a missing name", () => {
  const result = parseInvitespotLead(validBody({ name: "" }));
  assert.equal(result.ok, false);
});

test("rejects an invalid eventType", () => {
  const result = parseInvitespotLead(validBody({ eventType: "quinceanera" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.error, /planning/i);
});

test("roughDate, guestCount, and referralSlug are all optional", () => {
  const result = parseInvitespotLead(validBody({ roughDate: undefined, guestCount: undefined, referralSlug: undefined }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.roughDate, "");
  assert.equal(result.value.guestCount, null);
  assert.equal(result.value.referralSlug, "");
});

test("guestCount coerces a non-numeric value to null rather than throwing", () => {
  const result = parseInvitespotLead(validBody({ guestCount: "not a number" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.guestCount, null);
});

test("trims and length-caps free text fields", () => {
  const result = parseInvitespotLead(validBody({ name: "  Chidinma O.  ", roughDate: "x".repeat(300) }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.name, "Chidinma O.");
  assert.equal(result.value.roughDate.length, 120);
});

test("rejects a non-object body", () => {
  const result = parseInvitespotLead(null);
  assert.equal(result.ok, false);
});
