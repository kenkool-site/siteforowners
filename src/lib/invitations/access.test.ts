import assert from "node:assert/strict";
import test from "node:test";
import { canRemoveInvitationResponse, resolveInvitationAccess } from "./access";

test("only founder access can permanently remove an invitation response", () => {
  assert.equal(canRemoveInvitationResponse({ kind: "founder" }), true);
  assert.equal(canRemoveInvitationResponse({ kind: "owner", ownerId: "owner-1" }), false);
  assert.equal(canRemoveInvitationResponse(null), false);
});

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

test("an active co-host membership grants the same event access", async () => {
  const result = await resolveInvitationAccess({
    adminSessionValue: undefined,
    adminPassword: "founder-secret",
    ownerSession: { ownerId: "cohost-1", expiresAt: 2_000_000_000 },
    eventId: "event-1",
    ownerOwnsEvent: async (ownerId, eventId) => ownerId === "cohost-1" && eventId === "event-1",
  });
  assert.deepEqual(result, { kind: "owner", ownerId: "cohost-1" });
});
