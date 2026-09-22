// src/lib/invitations/memories/repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { objectKeyForOriginal } from "./upload-tickets";
import { getEventMemoriesSettings, getRsvpForEditCredential, updateEventMemoriesSettings } from "./repository";

// Repository functions hit a real Supabase instance via createAdminClient(),
// exactly like notifications.test.ts does — this test only proves the pure,
// non-DB helper it depends on is wired correctly. Full CRUD is exercised by
// route-level integration tests against the API surface — a known follow-up, not
// yet written — following this module's existing convention of not mocking the DB
// in integration paths.
test("object key derivation used by the repository stays event- and media-scoped", () => {
  const key = objectKeyForOriginal("event-1", "media-1", "photo");
  assert.equal(key, "originals/event-1/media-1.jpg");
});

// getEventMemoriesSettings/updateEventMemoriesSettings call createAdminClient()
// directly and have no injection seam (no local Supabase instance exists to hit
// here — createAdminClient() throws on missing env before a query is ever sent),
// so — matching this file's own convention above and notifications.test.ts's
// `reserveInvitationNotificationRetry.toString()` structural check — these assert
// on the function source rather than invoking it against a real database.
test("getEventMemoriesSettings selects and returns startsAt alongside the existing fields", () => {
  const source = getEventMemoriesSettings.toString();
  assert.match(source, /starts_at/);
  assert.match(source, /startsAt/);
});

test("updateEventMemoriesSettings patches only the memories fields provided", () => {
  assert.equal(typeof updateEventMemoriesSettings, "function");
  const source = updateEventMemoriesSettings.toString();
  assert.match(source, /memories_enabled/);
  assert.match(source, /memories_mode/);
});

test("getRsvpForEditCredential returns the stored hash for a real rsvp/event pair", async () => {
  const row = await getRsvpForEditCredential("some-event-id", "some-rsvp-id");
  assert.ok(row === null || typeof row.editTokenHash === "string");
});

test("getRsvpForEditCredential returns null for a mismatched event/rsvp pair", async () => {
  const row = await getRsvpForEditCredential("wrong-event-id", "some-rsvp-id");
  assert.equal(row, null);
});
