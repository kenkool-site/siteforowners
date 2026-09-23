import { test } from "node:test";
import assert from "node:assert/strict";
import { hashEditToken } from "@/lib/invitations/auth";
import { resolveMemoriesGuestSession } from "./resolve-guest-session";

test("session route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

// resolveMemoriesGuestSession is the pure decision logic the route delegates to:
// given the already-fetched RSVP row (or null) and the guest-provided credential,
// decide the resulting session's level/rsvpId/guestName. Extracted so this
// genuinely security-relevant decision (anonymous vs. rsvp_guest) has real unit
// coverage without needing HTTP-level route integration testing, which this
// codebase's `tsx --test` convention doesn't support.

test("resolveMemoriesGuestSession: no credential provided -> anonymous", async () => {
  const session = resolveMemoriesGuestSession("event-1", null, null, "Jamie", 1_700_000_000);
  assert.equal(session.level, "anonymous");
  assert.equal(session.rsvpId, undefined);
  assert.equal(session.guestName, "Jamie");
  assert.equal(session.eventId, "event-1");
});

test("resolveMemoriesGuestSession: valid credential + matching row -> rsvp_guest with the right rsvpId/guestName", async () => {
  const token = "correct-edit-token";
  const editTokenHash = hashEditToken(token);
  const session = resolveMemoriesGuestSession(
    "event-1",
    { primaryName: "Taylor Stored Name", editTokenHash },
    { rsvpId: "rsvp-1", editToken: token },
    undefined,
    1_700_000_000,
  );
  assert.equal(session.level, "rsvp_guest");
  assert.equal(session.rsvpId, "rsvp-1");
  assert.equal(session.guestName, "Taylor Stored Name");
});

test("resolveMemoriesGuestSession: a guest-provided name overrides the RSVP's stored name", async () => {
  const token = "correct-edit-token";
  const editTokenHash = hashEditToken(token);
  const session = resolveMemoriesGuestSession(
    "event-1",
    { primaryName: "Stored Name", editTokenHash },
    { rsvpId: "rsvp-1", editToken: token },
    "Guest Typed Name",
    1_700_000_000,
  );
  assert.equal(session.level, "rsvp_guest");
  assert.equal(session.guestName, "Guest Typed Name");
});

test("resolveMemoriesGuestSession: credential present but verifyEditToken fails -> falls back to anonymous, not an error", async () => {
  const editTokenHash = hashEditToken("the-real-token");
  const session = resolveMemoriesGuestSession(
    "event-1",
    { primaryName: "Taylor", editTokenHash },
    { rsvpId: "rsvp-1", editToken: "wrong-token" },
    undefined,
    1_700_000_000,
  );
  assert.equal(session.level, "anonymous");
  assert.equal(session.rsvpId, undefined);
});

test("resolveMemoriesGuestSession: credential present but no matching rsvp row (replay across events) -> falls back to anonymous", async () => {
  const session = resolveMemoriesGuestSession(
    "event-1",
    null,
    { rsvpId: "rsvp-1", editToken: "whatever" },
    undefined,
    1_700_000_000,
  );
  assert.equal(session.level, "anonymous");
  assert.equal(session.rsvpId, undefined);
});

test("resolveMemoriesGuestSession: expiresAt is derived from the provided clock plus the session lifetime", async () => {
  const now = 1_700_000_000;
  const session = resolveMemoriesGuestSession("event-1", null, null, undefined, now);
  assert.equal(session.expiresAt, now + 400 * 24 * 60 * 60);
});

test("resolveMemoriesGuestSession preserves a stable contributor session id across re-mints", () => {
  const session = resolveMemoriesGuestSession("event-1", null, null, "Jamie", 1_700_000_000, "session-stable");
  assert.equal(session.sessionId, "session-stable");
});
