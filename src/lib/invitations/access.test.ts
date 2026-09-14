import assert from "node:assert/strict";
import test from "node:test";
import { resolveInvitationAccess } from "./access";

test("founder access does not depend on event ownership", async () => {
  const access = await resolveInvitationAccess({
    adminSessionValue: "founder-secret",
    adminPassword: "founder-secret",
    ownerSession: null,
    eventId: "event-1",
    ownerOwnsEvent: async () => false,
  });
  assert.deepEqual(access, { kind: "founder" });
});

test("an owner can access only an event they own", async () => {
  const permitted = await resolveInvitationAccess({
    adminSessionValue: undefined,
    adminPassword: "founder-secret",
    ownerSession: { ownerId: "owner-1", expiresAt: 2_000 },
    eventId: "event-1",
    ownerOwnsEvent: async (ownerId, eventId) => ownerId === "owner-1" && eventId === "event-1",
  });
  const denied = await resolveInvitationAccess({
    adminSessionValue: undefined,
    adminPassword: "founder-secret",
    ownerSession: { ownerId: "owner-1", expiresAt: 2_000 },
    eventId: "event-2",
    ownerOwnsEvent: async (ownerId, eventId) => ownerId === "owner-1" && eventId === "event-1",
  });

  assert.deepEqual(permitted, { kind: "owner", ownerId: "owner-1" });
  assert.equal(denied, null);
});
