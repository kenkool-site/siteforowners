import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitationWordingInput, normalizeInvitationWording, suggestInvitationWording } from "./wording";

test("wording input includes public facts but excludes owner and notification data", () => {
  const input = buildInvitationWordingInput({ title: "Mercy & John", honoreeNames: "Mercy and John", eventType: "wedding", locale: "en", startsAt: "2026-12-19T13:48:00Z", venueName: "The Bliss", address: "Aubrey, TX", notificationEmail: "private@example.com", owner: { email: "owner@example.com" } });
  assert.equal(input.title, "Mercy & John");
  assert.equal("notificationEmail" in input, false);
  assert.equal("owner" in input, false);
});

test("normalizes bounded AI wording", () => {
  assert.deepEqual(normalizeInvitationWording({ description: " Celebrate with us. ", rsvpPrompt: "Please respond.", styleNote: "Garden formal." }), { description: "Celebrate with us.", rsvpPrompt: "Please respond.", styleNote: "Garden formal." });
  assert.equal(normalizeInvitationWording({ description: "x".repeat(601) }), null);
});

test("accepts only normalized structured wording from the model", async () => {
  const wording = await suggestInvitationWording(buildInvitationWordingInput({ title: "Mercy & John" }), {
    generate: async () => "Here is the result: {\"description\":\"Join us in celebration.\",\"rsvpPrompt\":\"Kindly reply.\",\"styleNote\":\"Formal and warm.\"}",
  });
  assert.equal(wording.description, "Join us in celebration.");
  await assert.rejects(() => suggestInvitationWording(buildInvitationWordingInput({}), { generate: async () => "not json" }));
});
