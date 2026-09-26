import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { MemoryMedia } from "@/lib/invitations/memories/types";
import type { ModerateMediaDependencies } from "./moderate-media";
import { moderateMedia } from "./moderate-media";

test("moderate route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.POST, "function");
});

test("moderate-media module loads under tsx --test", async () => {
  const mod = await import("./moderate-media");
  assert.equal(typeof mod.moderateMedia, "function");
});

// route.ts is now a thin framework-facing wrapper (a route.ts file may only
// export the recognized HTTP handlers and a small set of config fields —
// see this repo's CLAUDE.md); the real work lives in the sibling
// moderate-media.ts so upload/complete/route.ts can call it directly for
// video's independent moderation trigger (see moderate-media.ts's own header
// comment for why). This asserts route.ts kept its auth guard and actually
// delegates, rather than duplicating or dropping the internal-secret check.
test("route.ts keeps the internal-secret guard and delegates to moderateMedia", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /x-memories-internal-secret/);
  assert.match(source, /status: 401/);
  assert.match(source, /moderateMedia\(mediaId\)/);
});

function media(overrides: Partial<MemoryMedia> & { id: string }): MemoryMedia {
  return {
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: null,
    uploaderDisplayName: "Jamie",
    guestSessionLevel: "guest",
    mediaKind: "photo",
    objectKeyOriginal: `originals/${overrides.id}.jpg`,
    objectKeyDisplay: `display/${overrides.id}.webp`,
    objectKeyThumbnail: `thumb/${overrides.id}.webp`,
    capturedAt: "2026-09-22T20:00:00Z",
    uploadedAt: "2026-09-22T20:01:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "pending",
    aiStatus: "pending",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  } as MemoryMedia;
}

function settings(overrides: Partial<{ memoriesEnabled: boolean; memoriesMode: "auto_publish" | "review_required"; startsAt: string | null; findMeEnabled: boolean }> = {}) {
  return { memoriesEnabled: true, memoriesMode: "auto_publish" as const, startsAt: null, findMeEnabled: false, ...overrides };
}

// moderateMedia downloads moderation-input bytes via a plain, module-level
// `fetch(downloadUrl)` call — unlike the repository/provider calls, that
// fetch has no dependency-injection seam of its own (the presigned URL it
// fetches is a real R2 URL in production; here it's whatever the injected
// `storage.getSignedDownloadUrl` fake returns). Stub the one global so tests
// can exercise everything past the download step without a real network
// call, and always restore it afterwards so no other test file in the same
// process is affected.
async function withStubbedFetch<T>(fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

// A fully "never called unless overridden" set of dependencies, mirroring
// highlights-route.test.ts's own noopDependencies() convention for this same
// plan's other DI-factored route logic.
function baseDependencies(overrides: ModerateMediaDependencies = {}): ModerateMediaDependencies {
  return {
    getMemoryMediaById: async () => {
      throw new Error("getMemoryMediaById not stubbed for this test");
    },
    getEventMemoriesSettings: async () => settings(),
    updateMemoryMediaModeration: async () => undefined,
    upsertMemoryMediaDescriptor: async () => undefined,
    requestHighlightGeneration: async () => null,
    storage: {
      createPresignedUploadUrl: async () => "https://example.test/upload",
      getSignedDownloadUrl: async (key: string) => `https://example.test/${key}`,
      deleteObject: async () => undefined,
      objectExists: async () => true,
    },
    aiProvider: {
      moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
      detectLabels: async () => [],
      detectFaces: async () => false,
      compareFaces: async () => 0,
    },
    ...overrides,
  };
}

test("returns 409 when the media row doesn't exist or has no objectKeyDisplay yet", async () => {
  const result = await moderateMedia("m1", baseDependencies({ getMemoryMediaById: async () => null }));
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "media not ready for moderation");
});

test("returns 404 when the event has no memories settings row", async () => {
  const result = await moderateMedia(
    "m1",
    baseDependencies({
      getMemoryMediaById: async () => media({ id: "m1" }),
      getEventMemoriesSettings: async () => null,
    }),
  );
  assert.equal(result.status, 404);
  assert.equal(result.body.error, "event not found");
});

test("uses the poster (objectKeyThumbnail) for video media, not the moderation-derivative key", async () => {
  const requestedKeys: string[] = [];
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1", mediaKind: "video", objectKeyThumbnail: "thumb/m1.jpg" }),
        storage: {
          createPresignedUploadUrl: async () => "https://example.test/upload",
          getSignedDownloadUrl: async (key: string) => {
            requestedKeys.push(key);
            return `https://example.test/${key}`;
          },
          deleteObject: async () => undefined,
          objectExists: async () => true,
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
      }),
    ),
  );
  assert.equal(result.status, 200);
  assert.deepEqual(requestedKeys, ["thumb/m1.jpg"]);
});

test("still uses deriveObjectKeys(...).moderation for photo media, unchanged", async () => {
  const requestedKeys: string[] = [];
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1", mediaKind: "photo" }),
        storage: {
          createPresignedUploadUrl: async () => "https://example.test/upload",
          getSignedDownloadUrl: async (key: string) => {
            requestedKeys.push(key);
            return `https://example.test/${key}`;
          },
          deleteObject: async () => undefined,
          objectExists: async () => true,
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
      }),
    ),
  );
  assert.equal(result.status, 200);
  assert.equal(requestedKeys.length, 1);
  assert.match(requestedKeys[0]!, /^moderation\//);
});

test("fails clearly with a 500, not a crash, when a video item has no thumbnail key", async () => {
  const result = await moderateMedia(
    "m1",
    baseDependencies({
      getMemoryMediaById: async () => media({ id: "m1", mediaKind: "video", objectKeyThumbnail: null as unknown as string }),
    }),
  );
  assert.equal(result.status, 500);
  assert.equal(result.body.error, "moderation failed");
});

test("returns 500 when the Rekognition/download step throws, without persisting a moderation status", async () => {
  let updateCalled = false;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1" }),
        updateMemoryMediaModeration: async () => {
          updateCalled = true;
        },
        aiProvider: {
          moderateImage: async () => {
            throw new Error("rekognition down");
          },
          detectLabels: async () => [],
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
      }),
    ),
  );
  assert.equal(result.status, 500);
  assert.equal(updateCalled, false, "must not persist a moderation status when moderation itself failed");
});

test("persists AI Highlight descriptors and queues generation for approved media", async () => {
  let descriptorMediaId: string | undefined;
  let generationQueuedFor: string | undefined;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1" }),
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }), // resolves to "approved" under auto_publish
          detectLabels: async () => [{ name: "Cake", confidence: 0.9 }],
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
        upsertMemoryMediaDescriptor: async (input) => {
          descriptorMediaId = input.mediaId;
        },
        requestHighlightGeneration: async (eventId) => {
          generationQueuedFor = eventId;
          return null;
        },
      }),
    ),
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.moderationStatus, "approved");
  assert.equal(descriptorMediaId, "m1");
  assert.equal(generationQueuedFor, "event-1");
});

test("does not queue a generation for awaiting_host_review media, but still persists its descriptor", async () => {
  let descriptorCalled = false;
  let generationCalled = false;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1" }),
        getEventMemoriesSettings: async () => settings({ memoriesMode: "review_required" }),
        aiProvider: {
          // Below FLAG_THRESHOLD (0.4) resolves to "awaiting_host_review" under
          // review_required mode (the same low-confidence result would resolve
          // to "approved" under auto_publish instead — see the test above).
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => [],
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
        upsertMemoryMediaDescriptor: async () => {
          descriptorCalled = true;
        },
        requestHighlightGeneration: async () => {
          generationCalled = true;
          return null;
        },
      }),
    ),
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.moderationStatus, "awaiting_host_review");
  assert.equal(descriptorCalled, true);
  assert.equal(generationCalled, false, "must not queue generation for media not yet approved");
});

test("does not attempt descriptor extraction for rejected media", async () => {
  let descriptorCalled = false;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1" }),
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0.99, categories: ["Explicit Nudity"] }),
          detectLabels: async () => [],
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
        upsertMemoryMediaDescriptor: async () => {
          descriptorCalled = true;
        },
      }),
    ),
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.moderationStatus, "rejected");
  assert.equal(descriptorCalled, false);
});

test("a descriptor-extraction failure is non-fatal — moderation status was already committed and 200 is still returned", async () => {
  let updateCalled = false;
  const result = await withStubbedFetch(() =>
    moderateMedia(
      "m1",
      baseDependencies({
        getMemoryMediaById: async () => media({ id: "m1" }),
        updateMemoryMediaModeration: async () => {
          updateCalled = true;
        },
        aiProvider: {
          moderateImage: async () => ({ highestConfidence: 0, categories: [] }),
          detectLabels: async () => {
            throw new Error("labels service down");
          },
          detectFaces: async () => false,
          compareFaces: async () => 0,
        },
      }),
    ),
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.moderationStatus, "approved");
  assert.equal(updateCalled, true, "the moderation outcome must already be persisted before descriptor extraction runs");
});

// Structural, matching the route-contract tests in
// src/lib/invitations/*-route*.test.ts and settings-route.test.ts: this
// guards against the old, unrelated Moment classifier this task's predecessor
// replaced ever creeping back into the extracted moderation logic.
test("moderate-media wires in the AI Highlight pipeline instead of the old Moment classifier", () => {
  const source = readFileSync(new URL("./moderate-media.ts", import.meta.url), "utf8");
  assert.match(source, /detectLabels\(/);
  assert.match(source, /upsertDescriptor\(|upsertMemoryMediaDescriptor\(/);
  assert.match(source, /requestGeneration\(|requestHighlightGeneration\(/);
  assert.doesNotMatch(source, /moment-classification/);
  assert.doesNotMatch(source, /listMemoryMoments/);
  assert.doesNotMatch(source, /setAiClassifiedMoment/);
});
