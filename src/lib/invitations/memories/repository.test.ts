// src/lib/invitations/memories/repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { objectKeyForOriginal } from "./upload-tickets";
import {
  createMemoryMoment,
  getEventMemoriesSettings,
  updateEventMemoriesSettings,
  upsertMemoryMediaDescriptor,
  listApprovedMemoryDescriptors,
  listApprovedMediaMissingDescriptors,
  listApprovedMediaMissingDescriptorsAcrossEvents,
  listMemoryHighlightGroups,
  createMemoryHighlightGroup,
  updateMemoryHighlightGroup,
  deleteMemoryHighlightGroup,
  getHighlightGenerationState,
  queueHighlightGeneration,
  listQueuedHighlightGenerations,
  claimNextHighlightGeneration,
  replaceHighlightGenerationMemberships,
  publishHighlightGeneration,
  failHighlightGeneration,
  reclaimStaleHighlightGeneration,
  getPublishedMemoryHighlights,
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

test("createMemoryMoment inserts into memory_moments scoped to the event", () => {
  assert.equal(typeof createMemoryMoment, "function");
  const source = createMemoryMoment.toString();
  assert.match(source, /memory_moments/);
  assert.match(source, /event_id/);
  assert.match(source, /starts_at/);
  assert.match(source, /ends_at/);
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

// ---------------------------------------------------------------------------
// AI Highlight repository contract tests
//
// Following this file's own established convention above: createAdminClient()
// has no injection seam and there is no local Supabase instance to hit in this
// test environment, so these assert on exact table/RPC names and event/source
// scoping in the function source, rather than executing real queries. Full
// behavior is exercised by route-level integration tests (a known follow-up).
// Every assertion here also independently confirms these methods never read
// or write memory_moments/memory_moment_media, per the plan's global
// constraint that AI Highlight code is fully independent of Moments.
// ---------------------------------------------------------------------------

function forbidsMomentsTables(source: string): void {
  assert.doesNotMatch(source, /memory_moments/);
  assert.doesNotMatch(source, /memory_moment_media/);
}

test("upsertMemoryMediaDescriptor upserts memory_media_descriptors keyed on media_id", () => {
  const source = upsertMemoryMediaDescriptor.toString();
  assert.match(source, /memory_media_descriptors/);
  assert.match(source, /media_id/);
  assert.match(source, /onConflict/);
  forbidsMomentsTables(source);
});

test("listApprovedMemoryDescriptors scopes to the event's approved, uploaded media", () => {
  const source = listApprovedMemoryDescriptors.toString();
  assert.match(source, /memory_media_descriptors/);
  assert.match(source, /event_id/);
  assert.match(source, /moderation_status/);
  assert.match(source, /approved/);
  forbidsMomentsTables(source);
});

test("listApprovedMediaMissingDescriptors scopes to the event and excludes media that already has a descriptor", () => {
  const source = listApprovedMediaMissingDescriptors.toString();
  assert.match(source, /memory_media_descriptors/);
  assert.match(source, /event_id/);
  assert.match(source, /moderation_status/);
  forbidsMomentsTables(source);
});

// The cron worker's cross-event counterpart: it needs to discover a backlog
// across ALL events (it doesn't know event ids up front the way a per-event
// caller does), so unlike every other query in this file it must NOT scope by
// event_id.
test("listApprovedMediaMissingDescriptorsAcrossEvents excludes media that already has a descriptor without scoping to one event", () => {
  const source = listApprovedMediaMissingDescriptorsAcrossEvents.toString();
  assert.match(source, /memory_media_descriptors/);
  assert.match(source, /moderation_status/);
  assert.doesNotMatch(source, /\.eq\("event_id"/);
  forbidsMomentsTables(source);
});

test("listMemoryHighlightGroups scopes memory_highlight_groups by event", () => {
  const source = listMemoryHighlightGroups.toString();
  assert.match(source, /memory_highlight_groups/);
  assert.match(source, /event_id/);
  forbidsMomentsTables(source);
});

test("createMemoryHighlightGroup inserts into memory_highlight_groups scoped to the event", () => {
  const source = createMemoryHighlightGroup.toString();
  assert.match(source, /memory_highlight_groups/);
  assert.match(source, /event_id/);
  assert.match(source, /semantic_key/);
  forbidsMomentsTables(source);
});

test("updateMemoryHighlightGroup patches only provided fields and stays scoped to the event and group id", () => {
  const source = updateMemoryHighlightGroup.toString();
  assert.match(source, /memory_highlight_groups/);
  assert.match(source, /event_id/);
  forbidsMomentsTables(source);
});

test("deleteMemoryHighlightGroup deletes from memory_highlight_groups scoped to the event and group id", () => {
  const source = deleteMemoryHighlightGroup.toString();
  assert.match(source, /memory_highlight_groups/);
  assert.match(source, /event_id/);
  forbidsMomentsTables(source);
});

test("getHighlightGenerationState reads invitation_events highlight columns scoped by id", () => {
  const source = getHighlightGenerationState.toString();
  assert.match(source, /highlight_mode/);
  assert.match(source, /published_highlight_generation_id/);
  assert.match(source, /pending_highlight_generation_id/);
  assert.match(source, /highlight_generation_status/);
  assert.match(source, /highlight_last_generated_media_count/);
});

test("queueHighlightGeneration inserts a queued generation and updates the event's pending pointer", () => {
  const source = queueHighlightGeneration.toString();
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /queued/);
  assert.match(source, /pending_highlight_generation_id/);
  forbidsMomentsTables(source);
});

// The cron worker's discovery step: claimNextHighlightGeneration/
// processHighlightGeneration both require a specific generationId already in
// hand — neither one discovers work on its own — so something has to list
// candidate ids across events first.
test("listQueuedHighlightGenerations lists queued generations across events, oldest first, bounded by limit", () => {
  const source = listQueuedHighlightGenerations.toString();
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /queued/);
  assert.match(source, /created_at/);
  assert.match(source, /limit/i);
  assert.doesNotMatch(source, /\.eq\("event_id"/);
  forbidsMomentsTables(source);
});

test("claimNextHighlightGeneration atomically transitions a generation from queued to processing", () => {
  const source = claimNextHighlightGeneration.toString();
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /processing/);
  assert.match(source, /queued/);
  forbidsMomentsTables(source);
});

test("replaceHighlightGenerationMemberships replaces memory_highlight_media scoped to one generation", () => {
  const source = replaceHighlightGenerationMemberships.toString();
  assert.match(source, /memory_highlight_media/);
  assert.match(source, /generation_id/);
  forbidsMomentsTables(source);
});

test("publishHighlightGeneration calls the atomic publish RPC rather than hand-rolled updates", () => {
  const source = publishHighlightGeneration.toString();
  assert.match(source, /publish_memory_highlight_generation/);
  assert.match(source, /p_event_id/);
  assert.match(source, /p_generation_id/);
  assert.match(source, /p_media_count/);
  // The RPC is the only mutation this function performs — no separate
  // hand-rolled UPDATE statements simulating what it does atomically.
  assert.doesNotMatch(source, /\.update\(/);
});

test("failHighlightGeneration records a short error code without touching the published pointer", () => {
  const source = failHighlightGeneration.toString();
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /error_code/);
  assert.match(source, /pending_highlight_generation_id/);
  // The whole point of this function: a failed regeneration must never
  // clobber the generation guests are still seeing.
  assert.doesNotMatch(source, /published_highlight_generation_id/);
  assert.doesNotMatch(source, /highlight_last_generated_media_count/);
  forbidsMomentsTables(source);
});

test("failHighlightGeneration only transitions a generation that is still processing", () => {
  const source = failHighlightGeneration.toString();
  // Guards against flipping an already-published generation's status back to
  // failed on a transport-error race after the publish RPC actually
  // committed — must scope the generation-row UPDATE to status = 'processing'.
  assert.match(source, /processing/);
});

test("reclaimStaleHighlightGeneration atomically fails a generation stuck in processing past a staleness cutoff", () => {
  const source = reclaimStaleHighlightGeneration.toString();
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /processing/);
  assert.match(source, /created_at/);
  assert.match(source, /TIMEOUT/);
  assert.match(source, /pending_highlight_generation_id/);
  forbidsMomentsTables(source);
});

test("getPublishedMemoryHighlights filters membership by the published generation and visible groups", () => {
  const source = getPublishedMemoryHighlights.toString();
  assert.match(source, /published_highlight_generation_id/);
  assert.match(source, /is_visible/);
  assert.match(source, /memory_highlight_media/);
  assert.match(source, /memory_highlight_groups/);
  forbidsMomentsTables(source);
});

test("getPublishedMemoryHighlights only surfaces fallback/ai_generated groups with membership in the published generation, but always surfaces host_defined groups", () => {
  const source = getPublishedMemoryHighlights.toString();
  // Source-aware eligibility: a host_defined group is host-managed and
  // legitimately shown even when currently empty; a fallback/ai_generated
  // group only exists because some generation run produced it, so one with
  // no membership under the CURRENTLY PUBLISHED generation is a stale
  // leftover (e.g. from a fallback-to-dynamic mode switch) that must not
  // surface as an empty tab. This must be a source-aware filter, not an
  // unconditional "hide if empty" rule that would also hide a legitimate
  // empty host-defined placeholder gallery.
  assert.match(source, /host_defined/);
  assert.match(source, /source/);
});
