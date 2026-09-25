// src/lib/invitations/memories/repository.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { objectKeyForOriginal } from "./upload-tickets";
import {
  markVideoMemoryMediaReady,
  createMemoryMoment,
  updateMemoryMoment,
  deleteMemoryMoment,
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
  updateEventHighlightMode,
  listHostDefinedHighlightGroupsWithCounts,
  getHighlightGenerationState,
  getHostHighlightsOverview,
  queueHighlightGeneration,
  listQueuedHighlightGenerations,
  claimNextHighlightGeneration,
  replaceHighlightGenerationMemberships,
  publishHighlightGeneration,
  failHighlightGeneration,
  reclaimStaleHighlightGeneration,
  requeueHighlightGeneration,
  getPublishedMemoryHighlights,
  selectEligibleHighlightGroups,
} from "./repository";
import type { MemoryHighlightGroup } from "./highlight-types";

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

// Video's counterpart to markMemoryMediaUploaded — matching this file's own
// established convention (see the header comment above): createAdminClient()
// has no injection seam, so this asserts on the function source rather than
// invoking it against a real database.
test("markVideoMemoryMediaReady sets display/thumbnail keys and processing_status without creating a processing job", () => {
  assert.equal(typeof markVideoMemoryMediaReady, "function");
  const source = markVideoMemoryMediaReady.toString();
  assert.match(source, /memory_media/);
  assert.match(source, /object_key_display/);
  assert.match(source, /object_key_thumbnail/);
  assert.match(source, /processing_status/);
  assert.match(source, /'ready'|"ready"/);
  // Video never enters the photon-rs derivative pipeline — this function must
  // not queue a memory_processing_jobs row the way markMemoryMediaUploaded does.
  assert.doesNotMatch(source, /memory_processing_jobs/);
  // Idempotency guard matching markMemoryMediaUploaded's own convention.
  // [\s\S] instead of the /s (dotAll) flag — matches this repo's own
  // migration-contract test convention (see e.g. rsvp-migration-contract.test.ts);
  // the /s flag needs an es2018+ tsc target, which this project's tsconfig
  // doesn't set, so it fails `tsc --noEmit` even though tsx runs it fine.
  assert.match(source, /upload_status[\s\S]*pending|pending[\s\S]*upload_status/);
});

test("createMemoryMoment inserts into memory_moments scoped to the event", () => {
  assert.equal(typeof createMemoryMoment, "function");
  const source = createMemoryMoment.toString();
  assert.match(source, /memory_moments/);
  assert.match(source, /event_id/);
  assert.match(source, /starts_at/);
  assert.match(source, /ends_at/);
});

test("updateMemoryMoment patches memory_moments scoped to both the moment id and the event", () => {
  assert.equal(typeof updateMemoryMoment, "function");
  const source = updateMemoryMoment.toString();
  assert.match(source, /memory_moments/);
  // Double-scoped like updateMemoryHighlightGroup's own .eq("id", ...).eq("event_id", ...)
  // pattern — a cross-event moment id must not be mutable via this call.
  assert.match(source, /\.eq\(\s*"id"/);
  assert.match(source, /\.eq\(\s*"event_id"/);
});

test("deleteMemoryMoment removes from memory_moments scoped to both the moment id and the event", () => {
  assert.equal(typeof deleteMemoryMoment, "function");
  const source = deleteMemoryMoment.toString();
  assert.match(source, /memory_moments/);
  assert.match(source, /\.eq\(\s*"id"/);
  assert.match(source, /\.eq\(\s*"event_id"/);
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

test("listApprovedMemoryDescriptors scopes to the event's approved, uploaded, and processing-ready media", () => {
  const source = listApprovedMemoryDescriptors.toString();
  assert.match(source, /memory_media_descriptors/);
  assert.match(source, /event_id/);
  assert.match(source, /moderation_status/);
  assert.match(source, /approved/);
  // Fix 5: must agree with gallery.ts's listGalleryVisibleMedia (guest
  // visibility) on processing_status, not just moderation/upload status —
  // otherwise a processing_failed item can get a descriptor, inflate the
  // approved count, and get grouped while staying invisible to guests.
  assert.match(source, /processing_status/);
  assert.match(source, /ready/);
  forbidsMomentsTables(source);
});

test("listApprovedMediaMissingDescriptors scopes to the event, excludes already-described media, and agrees with listApprovedMemoryDescriptors on processing_status", () => {
  const source = listApprovedMediaMissingDescriptors.toString();
  assert.match(source, /memory_media_descriptors/);
  assert.match(source, /event_id/);
  assert.match(source, /moderation_status/);
  // Fix 2 re-review: this is the gate processHighlightGeneration's
  // descriptor-readiness wait uses — without processing_status='ready' here
  // too, a processing_failed item (excluded from listApprovedMemoryDescriptors
  // and from guest visibility) would be reported as "missing a descriptor"
  // forever, since it can never actually acquire one.
  assert.match(source, /processing_status/);
  assert.match(source, /ready/);
  forbidsMomentsTables(source);
});

// The cron worker's cross-event counterpart: it needs to discover a backlog
// across ALL events (it doesn't know event ids up front the way a per-event
// caller does), so unlike every other query in this file it must NOT scope by
// event_id. Unlike every other function here, this one delegates the actual
// query to a SQL RPC (059_memory_highlight_missing_descriptors_rpc.sql)
// rather than a fetch-then-filter-in-JS shape — see that migration file, and
// repository-missing-descriptors-rpc.integration.test.ts, for why: an
// earlier fetch-then-filter version of this function had a real bug where
// capping the initial scan permanently hid genuinely-missing rows once the
// scan window filled up with already-described ones. This test can only
// confirm the TS wrapper delegates to that RPC correctly (see
// repository.test.ts's own header comment on why nothing here executes real
// SQL) — the integration test is what actually proves the anti-join finds a
// row outside a naive fixed-size scan window.
test("listApprovedMediaMissingDescriptorsAcrossEvents delegates the missing-descriptor filter to the SQL RPC, not a capped pre-filter scan", () => {
  const source = listApprovedMediaMissingDescriptorsAcrossEvents.toString();
  assert.match(source, /\.rpc\(/);
  assert.match(source, /list_approved_media_missing_descriptors_across_events/);
  assert.match(source, /p_limit/);
  // Guards against regressing back to the old buggy shape: no JS-side
  // pre-filter cap on a raw candidate scan before diffing against
  // descriptors.
  assert.doesNotMatch(source, /BACKFILL_SCAN_CAP/);
  assert.doesNotMatch(source, /\.from\("memory_media"\)/);
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

test("updateEventHighlightMode writes invitation_events.highlight_mode scoped by id", () => {
  const source = updateEventHighlightMode.toString();
  assert.match(source, /invitation_events/);
  assert.match(source, /highlight_mode/);
  assert.match(source, /event_id|\.eq\("id"/);
});

test("listHostDefinedHighlightGroupsWithCounts lists host_defined groups unfiltered by visibility, annotated with published-generation counts", () => {
  const source = listHostDefinedHighlightGroupsWithCounts.toString();
  assert.match(source, /host_defined/);
  assert.match(source, /published_highlight_generation_id/);
  assert.match(source, /memory_highlight_media/);
  // Unlike getPublishedMemoryHighlights, this must never filter by
  // is_visible — the host managing groups needs to see hidden ones too.
  assert.doesNotMatch(source, /is_visible/);
  forbidsMomentsTables(source);
});

test("getHighlightGenerationState reads invitation_events highlight columns scoped by id", () => {
  const source = getHighlightGenerationState.toString();
  assert.match(source, /highlight_mode/);
  assert.match(source, /published_highlight_generation_id/);
  assert.match(source, /pending_highlight_generation_id/);
  assert.match(source, /highlight_generation_status/);
  assert.match(source, /highlight_last_generated_media_count/);
  // Fix 6: highlight_generation_error was write-only (failHighlightGeneration/
  // reclaimStaleHighlightGeneration persist it, nothing read it back) — now
  // selected and mapped onto the returned state as `generationError`.
  assert.match(source, /highlight_generation_error/);
  assert.match(source, /generationError/);
});

test("getHostHighlightsOverview composes generation state with host-defined groups+counts, including the generation error detail", () => {
  const source = getHostHighlightsOverview.toString();
  assert.match(source, /getHighlightGenerationState/);
  assert.match(source, /listHostDefinedHighlightGroupsWithCounts/);
  assert.match(source, /generationError/);
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

// Fix 2: lets processHighlightGeneration's descriptor-readiness wait send a
// claimed generation back to 'queued' in place, rather than terminally
// failing it, when its approved media isn't fully descriptor-backfilled yet.
test("requeueHighlightGeneration atomically returns a generation from processing back to queued", () => {
  const source = requeueHighlightGeneration.toString();
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /queued/);
  assert.match(source, /processing/);
  // Must not create a new generation row or touch the published pointer —
  // the same row/id is simply returned to queued.
  assert.doesNotMatch(source, /\.insert\(/);
  assert.doesNotMatch(source, /published_highlight_generation_id/);
  forbidsMomentsTables(source);
});

test("getPublishedMemoryHighlights filters membership by the published generation and visible groups, keyed on the generation's own mode", () => {
  const source = getPublishedMemoryHighlights.toString();
  assert.match(source, /published_highlight_generation_id/);
  assert.match(source, /is_visible/);
  assert.match(source, /memory_highlight_media/);
  assert.match(source, /memory_highlight_groups/);
  // Fix 1: eligibility must key off the PUBLISHED GENERATION's own mode, not
  // each group's own source in isolation — see selectEligibleHighlightGroups.
  // Asserting the delegation (rather than re-checking host_defined/source
  // logic here, which now lives in that separately-tested pure function)
  // also proves this function actually fetches the generation row's mode.
  assert.match(source, /memory_highlight_generations/);
  assert.match(source, /\bmode\b/);
  assert.match(source, /selectEligibleHighlightGroups/);
  forbidsMomentsTables(source);
});

// ---------------------------------------------------------------------------
// selectEligibleHighlightGroups — Fix 1's actual behavioral proof. Extracted
// as a pure function specifically so this can be tested with real inputs and
// real assertions, not just a source-regex check (unlike the rest of this
// file — see its header comment on why: createAdminClient() has no
// injection seam and there's no live Supabase instance to hit here — this
// function needs neither).
// ---------------------------------------------------------------------------

function highlightGroup(overrides: Partial<MemoryHighlightGroup> & { id: string; source: MemoryHighlightGroup["source"] }): MemoryHighlightGroup {
  return {
    eventId: "event-1",
    name: "Untitled",
    description: null,
    semanticKey: overrides.id,
    sortOrder: 0,
    isVisible: true,
    ...overrides,
  };
}

test("selectEligibleHighlightGroups: automatic/fallback generation mode excludes host_defined groups and only includes fallback/ai_generated groups with membership in this generation", () => {
  // Reproduces the reported bug scenario: a host previously published a
  // host_defined generation with an empty group, then switched back to
  // automatic and published a NEW fallback/automatic generation with real
  // groups. The old host_defined group must not appear.
  const groups = [
    highlightGroup({ id: "old-host-group", source: "host_defined" }),
    highlightGroup({ id: "ai-empty", source: "ai_generated" }),
    highlightGroup({ id: "ai-full", source: "ai_generated" }),
  ];
  const mediaIdsByGroup = new Map<string, string[]>([
    ["old-host-group", []],
    ["ai-empty", []],
    ["ai-full", ["m1", "m2"]],
  ]);

  const eligible = selectEligibleHighlightGroups("automatic", groups, mediaIdsByGroup);

  assert.deepEqual(eligible.map((group) => group.id), ["ai-full"]);
});

test("selectEligibleHighlightGroups: host_defined generation mode includes all host_defined groups even when empty, and excludes stale fallback/ai_generated groups regardless of membership", () => {
  const groups = [
    highlightGroup({ id: "host-empty", source: "host_defined" }),
    highlightGroup({ id: "host-full", source: "host_defined" }),
    highlightGroup({ id: "stale-ai", source: "ai_generated" }),
  ];
  const mediaIdsByGroup = new Map<string, string[]>([
    ["host-empty", []],
    ["host-full", ["m1"]],
    // A group left over from before this generation's own mode switch — it
    // must not leak in just because it happens to still carry membership.
    ["stale-ai", ["m2"]],
  ]);

  const eligible = selectEligibleHighlightGroups("host_defined", groups, mediaIdsByGroup);

  assert.deepEqual(
    eligible.map((group) => group.id).sort(),
    ["host-empty", "host-full"],
  );
});

test("selectEligibleHighlightGroups: fallback mode behaves the same as automatic mode (host_defined excluded, membership required)", () => {
  const groups = [highlightGroup({ id: "host", source: "host_defined" }), highlightGroup({ id: "fallback-full", source: "fallback" })];
  const mediaIdsByGroup = new Map<string, string[]>([
    ["host", ["m1"]],
    ["fallback-full", ["m1"]],
  ]);

  const eligible = selectEligibleHighlightGroups("fallback", groups, mediaIdsByGroup);

  assert.deepEqual(eligible.map((group) => group.id), ["fallback-full"]);
});
