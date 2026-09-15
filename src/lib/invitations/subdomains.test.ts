import assert from "node:assert/strict";
import test from "node:test";
import { findAvailableInvitationSubdomain, isPlatformSubdomainTakenError } from "./subdomains";

test("subdomain availability keeps the event's own current label", async () => {
  const result = await findAvailableInvitationSubdomain("Mercy & John", "event-1", {
    findReservation: async () => ({ invitationEventId: "event-1" }),
  });
  assert.deepEqual(result, { available: true, normalized: "mercy-john", suggestion: "mercy-john" });
});

test("subdomain availability skips tenant and other-invitation reservations", async () => {
  const taken = new Set(["mercy-john", "mercy-john-2"]);
  const result = await findAvailableInvitationSubdomain("Mercy & John", null, {
    findReservation: async (label) => taken.has(label) ? { tenantId: "tenant-1" } : null,
  });
  assert.deepEqual(result, { available: false, normalized: "mercy-john", suggestion: "mercy-john-3" });
});

test("reserved names return the next safe suggestion", async () => {
  const result = await findAvailableInvitationSubdomain("admin", null, {
    findReservation: async () => null,
  });
  assert.deepEqual(result, { available: false, normalized: "admin", suggestion: "admin-event" });
});

test("subdomain collision detection follows wrapped database errors", () => {
  const error = new Error("Unable to update invitation", {
    cause: new Error("PLATFORM_SUBDOMAIN_TAKEN"),
  });
  assert.equal(isPlatformSubdomainTakenError(error), true);
  assert.equal(isPlatformSubdomainTakenError(new Error("another failure")), false);
});
