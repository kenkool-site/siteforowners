// src/app/api/memories/events/[eventId]/find-me/find-me-search.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { compareAgainstCandidates, downloadCandidates, searchFindMe } from "./find-me-search";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

function media(overrides: Partial<MemoryMedia> & { id: string }): MemoryMedia {
  return {
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: null,
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: `originals/${overrides.id}.jpg`,
    objectKeyDisplay: `display/${overrides.id}.webp`,
    objectKeyThumbnail: `thumb/${overrides.id}.webp`,
    capturedAt: "2026-09-24T20:00:00Z",
    uploadedAt: "2026-09-24T20:01:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "approved",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  } as unknown as MemoryMedia;
}

const SELFIE = new Uint8Array([1]);

test("compareAgainstCandidates keeps only candidates with a positive similarity, sorted best-first", async () => {
  const candidates = [
    { media: media({ id: "low" }), bytes: new Uint8Array([2]) },
    { media: media({ id: "none" }), bytes: new Uint8Array([3]) },
    { media: media({ id: "high" }), bytes: new Uint8Array([4]) },
  ];
  const scores: Record<string, number> = { low: 82, none: 0, high: 97 };
  const compareFaces = async (_source: Uint8Array, target: Uint8Array) => scores[["low", "none", "high"][target[0] - 2]];

  const result = await compareAgainstCandidates(SELFIE, candidates, compareFaces, 5);

  assert.deepEqual(result.map((r) => r.media.id), ["high", "low"]);
  assert.deepEqual(result.map((r) => r.similarity), [97, 82]);
});

test("compareAgainstCandidates respects a concurrency cap without dropping any candidate", async () => {
  const candidates = Array.from({ length: 12 }, (_, i) => ({ media: media({ id: `m${i}` }), bytes: new Uint8Array([i]) }));
  let inFlight = 0;
  let maxInFlight = 0;
  const compareFaces = async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return 90;
  };

  const result = await compareAgainstCandidates(SELFIE, candidates, compareFaces, 3);

  assert.equal(result.length, 12);
  assert.ok(maxInFlight <= 3, `expected at most 3 concurrent comparisons, saw ${maxInFlight}`);
});

test("compareAgainstCandidates returns an empty array for an empty candidate list", async () => {
  const result = await compareAgainstCandidates(SELFIE, [], async () => 100, 5);
  assert.deepEqual(result, []);
});

test("compareAgainstCandidates isolates a candidate whose comparison throws, still comparing and returning the rest", async () => {
  const candidates = [
    { media: media({ id: "boom" }), bytes: new Uint8Array([1]) },
    { media: media({ id: "ok-low" }), bytes: new Uint8Array([2]) },
    { media: media({ id: "ok-high" }), bytes: new Uint8Array([3]) },
  ];
  const scores: Record<string, number> = { "ok-low": 82, "ok-high": 97 };
  const compareFaces = async (_source: Uint8Array, target: Uint8Array) => {
    const id = ["boom", "ok-low", "ok-high"][target[0] - 1];
    if (id === "boom") throw new Error("throttled");
    return scores[id];
  };

  const result = await compareAgainstCandidates(SELFIE, candidates, compareFaces, 5);

  assert.deepEqual(result.map((r) => r.media.id), ["ok-high", "ok-low"]);
});

async function withStubbedFetch<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("will-404")) return new Response(null, { status: 404 });
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("downloadCandidates requests the moderation derivative (jpg) for a photo candidate, not the display webp", async () => {
  const requestedKeys: string[] = [];
  const photo = media({ id: "photo-1" });
  const storage = {
    createPresignedUploadUrl: async () => "https://example.test/upload",
    getSignedDownloadUrl: async (key: string) => {
      requestedKeys.push(key);
      return `https://example.test/${key}`;
    },
    deleteObject: async () => undefined,
    objectExists: async () => true,
  };

  await withStubbedFetch(() => downloadCandidates([photo], storage, 5));

  assert.equal(requestedKeys.length, 1);
  assert.match(requestedKeys[0], /^moderation\/.*\.jpg$/);
  assert.doesNotMatch(requestedKeys[0], /display\/.*\.webp$/);
});

test("downloadCandidates requests the thumbnail (jpg poster) for a video candidate", async () => {
  const requestedKeys: string[] = [];
  const video = media({ id: "video-1", mediaKind: "video", objectKeyThumbnail: "thumb/video-1.jpg" });
  const storage = {
    createPresignedUploadUrl: async () => "https://example.test/upload",
    getSignedDownloadUrl: async (key: string) => {
      requestedKeys.push(key);
      return `https://example.test/${key}`;
    },
    deleteObject: async () => undefined,
    objectExists: async () => true,
  };

  await withStubbedFetch(() => downloadCandidates([video], storage, 5));

  assert.deepEqual(requestedKeys, ["thumb/video-1.jpg"]);
});

test("downloadCandidates respects a concurrency cap without dropping any candidate", async () => {
  const candidateMedia = Array.from({ length: 12 }, (_, i) => media({ id: `m${i}` }));
  let inFlight = 0;
  let maxInFlight = 0;
  const storage = {
    createPresignedUploadUrl: async () => "https://example.test/upload",
    getSignedDownloadUrl: async (key: string) => `https://example.test/${key}`,
    deleteObject: async () => undefined,
    objectExists: async () => true,
  };
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight--;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  }) as typeof fetch;

  try {
    const result = await downloadCandidates(candidateMedia, storage, 3);
    assert.equal(result.length, 12);
    assert.ok(maxInFlight <= 3, `expected at most 3 concurrent downloads, saw ${maxInFlight}`);
  } finally {
    globalThis.fetch = original;
  }
});

function baseSearchDependencies(overrides: Parameters<typeof searchFindMe>[3] = {}): Parameters<typeof searchFindMe>[3] {
  return {
    getEventMemoriesSettings: async () => ({ memoriesEnabled: true, memoriesMode: "auto_publish", startsAt: null, findMeEnabled: true }),
    listGalleryVisibleMediaWithFaces: async () => [],
    allowFindMeAttempt: async () => "allowed",
    storage: {
      createPresignedUploadUrl: async () => "https://example.test/upload",
      getSignedDownloadUrl: async (key: string) => `https://example.test/${key}`,
      deleteObject: async () => undefined,
      objectExists: async () => true,
    },
    aiProvider: {
      moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
      detectLabels: async () => [],
      detectFaces: async () => true,
      compareFaces: async () => 0,
    },
    ...overrides,
  };
}

test("searchFindMe 404s when find_me_enabled is false", async () => {
  const result = await searchFindMe(
    "event-1",
    "session-1",
    SELFIE,
    baseSearchDependencies({ getEventMemoriesSettings: async () => ({ memoriesEnabled: true, memoriesMode: "auto_publish", startsAt: null, findMeEnabled: false }) }),
  );
  assert.equal(result.status, 404);
});

test("searchFindMe 404s when memories itself is disabled, even if find_me_enabled is true", async () => {
  const result = await searchFindMe(
    "event-1",
    "session-1",
    SELFIE,
    baseSearchDependencies({ getEventMemoriesSettings: async () => ({ memoriesEnabled: false, memoriesMode: "auto_publish", startsAt: null, findMeEnabled: true }) }),
  );
  assert.equal(result.status, 404);
});

test("searchFindMe 429s when the rate limiter denies the attempt", async () => {
  const result = await searchFindMe("event-1", "session-1", SELFIE, baseSearchDependencies({ allowFindMeAttempt: async () => "denied" }));
  assert.equal(result.status, 429);
});

// A rate-limit RPC failure is an infra error, not a genuine denial — it must
// surface as a 500 ("search failed"), never the same 429 a guest sees after
// really using up their attempts. See find-me-rate-limit.ts's "error" outcome.
test("searchFindMe 500s (not 429) when the rate limiter itself fails", async () => {
  const result = await searchFindMe("event-1", "session-1", SELFIE, baseSearchDependencies({ allowFindMeAttempt: async () => "error" }));
  assert.equal(result.status, 500);
});

test("searchFindMe returns 200 with matched media, skipping candidates whose download fails", async () => {
  const fetchable = media({ id: "fetchable" });
  const broken = media({ id: "broken" });
  const result = await withStubbedFetch(() =>
    searchFindMe(
      "event-1",
      "session-1",
      SELFIE,
      baseSearchDependencies({
        listGalleryVisibleMediaWithFaces: async () => [fetchable, broken],
        storage: {
          createPresignedUploadUrl: async () => "https://example.test/upload",
          getSignedDownloadUrl: async (key: string) => (key.includes("broken") ? "https://example.test/will-404" : "https://example.test/display/fetchable.webp"),
          deleteObject: async () => undefined,
          objectExists: async () => true,
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => true,
          compareFaces: async () => 92,
        },
      }),
    ),
  );

  assert.equal(result.status, 200);
  assert.equal(result.body.media?.length, 1);
  assert.equal(result.body.media?.[0].id, "fetchable");
});
