// src/lib/invitations/memories/guest-session.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { signMemoriesGuestSession, verifyMemoriesGuestSession } from "./guest-session";

const secret = "x".repeat(32);

test("a signed anonymous guest session verifies for its own event", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "anonymous", expiresAt: 2_000 },
    secret,
  );
  const result = verifyMemoriesGuestSession(token, "event-1", secret, 1_999);
  assert.deepEqual(result, { eventId: "event-1", level: "anonymous", expiresAt: 2_000 });
});

test("a session signed for one event is rejected when checked against another event", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "anonymous", expiresAt: 2_000 },
    secret,
  );
  assert.equal(verifyMemoriesGuestSession(token, "event-2", secret, 1_999), null);
});

test("an expired session is rejected even with a valid signature", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "anonymous", expiresAt: 1_000 },
    secret,
  );
  assert.equal(verifyMemoriesGuestSession(token, "event-1", secret, 1_001), null);
});

test("a tampered token is rejected", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "rsvp_guest", rsvpId: "rsvp-1", expiresAt: 2_000 },
    secret,
  );
  const tampered = token.slice(0, -4) + "abcd";
  assert.equal(verifyMemoriesGuestSession(tampered, "event-1", secret, 1_999), null);
});

test("an rsvp_guest session round-trips its rsvpId and optional guestName", () => {
  const token = signMemoriesGuestSession(
    { eventId: "event-1", level: "rsvp_guest", rsvpId: "rsvp-1", guestName: "Aisha T.", expiresAt: 2_000 },
    secret,
  );
  const result = verifyMemoriesGuestSession(token, "event-1", secret, 1_999);
  assert.deepEqual(result, {
    eventId: "event-1",
    level: "rsvp_guest",
    rsvpId: "rsvp-1",
    guestName: "Aisha T.",
    expiresAt: 2_000,
  });
});
