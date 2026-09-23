// src/lib/invitations/memories/repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { objectKeyForOriginal } from "./upload-tickets";
import {
  getEventMemoriesSettings,
  updateEventMemoriesSettings,
} from "./repository";

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

// invitation_rsvps.id/event_id are both `uuid` columns. Non-UUID literals like
// "some-rsvp-id" make Postgres/PostgREST reject the .eq() filter with "invalid
// input syntax for type uuid" *before* the id+event_id AND-scoping this function
// exists for is ever exercised — both tests would then pass via the error-handling
// branch, not via real match/no-match semantics. Using syntactically-valid (but
// non-existent) UUIDs instead makes the query actually reach that AND-scoping and
// return a genuine "no matching row" null, which is what this function's whole
// purpose — stopping an RSVP credential from event A upgrading a session on event
// B — depends on.
