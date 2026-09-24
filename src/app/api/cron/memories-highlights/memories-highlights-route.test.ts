// src/app/api/cron/memories-highlights/memories-highlights-route.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, runMemoriesHighlightsCron } from "./route";
import type { MemoriesHighlightsCronDependencies } from "./route";
import type { MemoryHighlightGeneration } from "@/lib/invitations/memories/highlight-types";
import type { MemoryMediaSummary } from "@/lib/invitations/memories/repository";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function generation(overrides: Partial<MemoryHighlightGeneration> & { id: string }): MemoryHighlightGeneration {
  return {
    eventId: "event-1",
    mode: "fallback",
    status: "queued",
    mediaCount: 0,
    errorCode: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    publishedAt: null,
    ...overrides,
  };
}

function media(overrides: Partial<MemoryMediaSummary> & { mediaId: string }): MemoryMediaSummary {
  return {
    eventId: "event-1",
    mediaKind: "photo",
    objectKeyDisplay: "display/event-1/media.webp",
    ...overrides,
  };
}

// A fully "never called" set of no-op dependencies, so each test only has to
// override the seams it actually exercises — mirrors
// highlight-service.test.ts's own convention for this codebase.
function noopDependencies(): MemoriesHighlightsCronDependencies {
  return {
    listQueuedHighlightGenerations: async () => [],
    processHighlightGeneration: async () => {},
    listApprovedMediaMissingDescriptorsAcrossEvents: async () => [],
    upsertMemoryMediaDescriptor: async () => {},
    detectLabels: async () => [],
  };
}

// ---------------------------------------------------------------------------
// Authorization (GET only — this is the one part of the route reachable
// without touching Supabase/R2/Rekognition; everything past the guard is
// exercised directly against runMemoriesHighlightsCron below).
// ---------------------------------------------------------------------------

test("GET returns 401 when the Authorization header is missing", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    const request = new NextRequest("http://localhost:3000/api/cron/memories-highlights");
    const response = await GET(request);
    assert.equal(response.status, 401);
  } finally {
    process.env.CRON_SECRET = original;
  }
});

test("GET returns 401 when the Authorization header doesn't match CRON_SECRET", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    const request = new NextRequest("http://localhost:3000/api/cron/memories-highlights", {
      headers: { authorization: "Bearer wrong-secret" },
    });
    const response = await GET(request);
    assert.equal(response.status, 401);
  } finally {
    process.env.CRON_SECRET = original;
  }
});

test("GET returns 401 when CRON_SECRET itself isn't configured, even given a header", async () => {
  const original = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const request = new NextRequest("http://localhost:3000/api/cron/memories-highlights", {
      headers: { authorization: "Bearer undefined" },
    });
    const response = await GET(request);
    assert.equal(response.status, 401);
  } finally {
    process.env.CRON_SECRET = original;
  }
});

test("GET passes the auth guard with a correct Authorization header (never returns 401)", async () => {
  const original = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    const request = new NextRequest("http://localhost:3000/api/cron/memories-highlights", {
      headers: { authorization: "Bearer test-secret" },
    });
    // Past the auth guard, GET calls the real runMemoriesHighlightsCron(),
    // which reaches createAdminClient() — no Supabase env is configured in
    // this test process, so that throws before any network call is even
    // attempted (see repository.test.ts's own note on this same property). A
    // rejection here — rather than a 401 Response — is exactly the proof this
    // test needs: the request got past the auth guard.
    await assert.rejects(() => GET(request));
  } finally {
    process.env.CRON_SECRET = original;
  }
});

// ---------------------------------------------------------------------------
// Generation processing: cap of 3, one failure doesn't stop the rest,
// response shape. Exercised directly against runMemoriesHighlightsCron, which
// is the DI seam the route factors its real work through specifically so
// these behaviors can be tested without a real Supabase/R2/Rekognition call.
// ---------------------------------------------------------------------------

test("claims and processes at most 3 queued generations per run, even if more are handed back", async () => {
  const allQueued = [
    generation({ id: "gen-1" }),
    generation({ id: "gen-2" }),
    generation({ id: "gen-3" }),
    generation({ id: "gen-4" }),
    generation({ id: "gen-5" }),
  ];
  const attempted: string[] = [];
  const result = await runMemoriesHighlightsCron({
    ...noopDependencies(),
    // Deliberately ignores the limit argument and returns 5 — proves the cap
    // is enforced by the cron itself, not merely by trusting its dependency.
    listQueuedHighlightGenerations: async () => allQueued,
    processHighlightGeneration: async (id: string) => {
      attempted.push(id);
    },
  });

  assert.deepEqual(attempted, ["gen-1", "gen-2", "gen-3"]);
  assert.equal(result.processed, 3);
  assert.equal(result.failed, 0);
});

test("one generation failing does not stop the others from being attempted", async () => {
  const queued = [generation({ id: "gen-1" }), generation({ id: "gen-2" }), generation({ id: "gen-3" })];
  const attempted: string[] = [];
  const result = await runMemoriesHighlightsCron({
    ...noopDependencies(),
    listQueuedHighlightGenerations: async () => queued,
    processHighlightGeneration: async (id: string) => {
      attempted.push(id);
      if (id === "gen-2") throw new Error("boom");
    },
  });

  assert.deepEqual(attempted, ["gen-1", "gen-2", "gen-3"], "all three must be attempted despite gen-2 throwing");
  assert.equal(result.processed, 2);
  assert.equal(result.failed, 1);
});

test("response reports numeric processed and failed counts", async () => {
  const result = await runMemoriesHighlightsCron(noopDependencies());
  assert.equal(typeof result.processed, "number");
  assert.equal(typeof result.failed, "number");
  assert.equal(result.processed, 0);
  assert.equal(result.failed, 0);
});

// ---------------------------------------------------------------------------
// Bounded descriptor backfill for existing events.
// ---------------------------------------------------------------------------

test("backfills at most 5 approved media missing descriptors per run, using the injected moderation-derivative detector", async () => {
  const items = Array.from({ length: 8 }, (_, i) => media({ mediaId: `media-${i}` }));
  const detectedFor: string[] = [];
  const upsertedFor: string[] = [];
  const result = await runMemoriesHighlightsCron({
    ...noopDependencies(),
    listApprovedMediaMissingDescriptorsAcrossEvents: async () => items,
    detectLabels: async (item) => {
      detectedFor.push(item.mediaId);
      return [{ name: "Cake", confidence: 0.9 }];
    },
    upsertMemoryMediaDescriptor: async ({ mediaId }) => {
      upsertedFor.push(mediaId);
    },
  });

  assert.deepEqual(detectedFor, ["media-0", "media-1", "media-2", "media-3", "media-4"]);
  assert.deepEqual(upsertedFor, ["media-0", "media-1", "media-2", "media-3", "media-4"]);
  assert.equal(result.backfilled, 5);
});

test("one backfill failure does not stop the others, and is tracked separately from generation failures", async () => {
  const items = [media({ mediaId: "media-1" }), media({ mediaId: "media-2" }), media({ mediaId: "media-3" })];
  const attempted: string[] = [];
  const result = await runMemoriesHighlightsCron({
    ...noopDependencies(),
    listApprovedMediaMissingDescriptorsAcrossEvents: async () => items,
    detectLabels: async (item) => {
      attempted.push(item.mediaId);
      if (item.mediaId === "media-2") throw new Error("rekognition failed");
      return [];
    },
  });

  assert.deepEqual(attempted, ["media-1", "media-2", "media-3"]);
  assert.equal(result.backfilled, 2);
  assert.equal(result.backfillFailed, 1);
  assert.equal(result.failed, 0, "backfill failures must never be counted as generation failures");
});
