import assert from "node:assert/strict";
import test from "node:test";
import { parseRsvpInput } from "./validation";

test("an RSVP requires a name and one normalized contact", () => {
  assert.deepEqual(
    parseRsvpInput({
      primaryName: " Ana ",
      email: "ANA@EXAMPLE.COM",
      attending: true,
      partySize: 2,
    }),
    {
      ok: true,
      value: {
        primaryName: "Ana",
        email: "ana@example.com",
        phone: null,
        attending: true,
        partySize: 2,
        additionalGuestNames: [],
        dietaryOrAccessibilityNotes: null,
        message: null,
      },
    },
  );
  assert.equal(
    parseRsvpInput({ primaryName: "Ana", attending: true, partySize: 1 }).ok,
    false,
  );
});

test("declines normalize party size to zero", () => {
  const parsed = parseRsvpInput({
    primaryName: "Ana",
    phone: "9175551212",
    attending: false,
    partySize: 4,
  });
  assert.equal(parsed.ok && parsed.value.partySize, 0);
});
