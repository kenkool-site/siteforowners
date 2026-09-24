// src/lib/invitations/memories/gallery.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { computeGalleryVisible, toPublicMemoryMedia } from "./gallery";
import type { MemoryMedia } from "./types";

function baseMedia(overrides: Partial<MemoryMedia>): MemoryMedia {
  return {
    id: "media-1",
    eventId: "event-1",
    uploaderRsvpId: null,
    uploaderSessionId: "00000000-0000-4000-8000-000000000001",
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: "originals/event-1/media-1.jpg",
    objectKeyDisplay: "display/event-1/media-1.webp",
    objectKeyThumbnail: "thumbnails/event-1/media-1.webp",
    capturedAt: null,
    uploadedAt: "2026-09-21T00:00:00Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "approved",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  };
}

test("uploaded, processed, and approved media is gallery-visible", () => {
  assert.equal(computeGalleryVisible(baseMedia({})), true);
});

test("media awaiting host review is never gallery-visible", () => {
  assert.equal(computeGalleryVisible(baseMedia({ moderationStatus: "awaiting_host_review" })), false);
});

test("flagged media is never gallery-visible, even if processing finished", () => {
  assert.equal(computeGalleryVisible(baseMedia({ moderationStatus: "flagged" })), false);
});

test("media still processing is never gallery-visible regardless of moderation outcome", () => {
  assert.equal(computeGalleryVisible(baseMedia({ processingStatus: "processing", moderationStatus: "approved" })), false);
});

test("public gallery projection excludes original keys, RSVP ids, and moderation details", () => {
  const projected = toPublicMemoryMedia(baseMedia({ uploaderRsvpId: "rsvp-private", moderationCategories: ["private"] }));
  assert.deepEqual(projected, {
    id: "media-1",
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: "display/event-1/media-1.webp",
    objectKeyThumbnail: "thumbnails/event-1/media-1.webp",
    capturedAt: null,
    uploadedAt: "2026-09-21T00:00:00Z",
  });
});

// Separation regression guard for Task 8: the old, one-shot AI-to-Moment
// classifier (matched Rekognition labels against a host-named Moment's own
// name) is fully superseded by the independent, multi-group AI Highlight
// system (highlight-types.ts / highlight-service.ts / GuestAiHighlightView).
// This walks the production Memories source (test files excluded, since
// negative-assertion tests like this one and moderate-route.test.ts
// legitimately contain these strings) and fails if anything still imports
// the deleted moment-classification module or calls setAiClassifiedMoment —
// the function that used to write an AI-derived row into memory_moment_media.
// setAiClassifiedMoment itself (along with listMomentOverridesForEvent) was
// deleted from repository.ts by the final-review consolidated fix wave: both
// had zero callers anywhere in the codebase (Task 8 removed the call sites
// but left the dead definitions behind) and setAiClassifiedMoment wrote to
// memory_moment_media, which this plan's Global Constraints explicitly
// forbid AI Highlight code from touching — a landmine for a future
// contributor who might wire it back in. No file needs a "calls" exemption
// anymore.
const PRODUCTION_ROOTS = [
  "src/lib/invitations/memories",
  "src/components/invitations/memories",
  "src/app/api/memories",
  "src/app/api/invitations/events",
];

function collectProductionSourceFiles(root: string): string[] {
  const absoluteRoot = path.join(process.cwd(), root);
  const files: string[] = [];
  const stack = [absoluteRoot];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
      files.push(fullPath);
    }
  }
  return files;
}

test("no production source imports the deleted moment-classification module or references setAiClassifiedMoment/listMomentOverridesForEvent", () => {
  for (const root of PRODUCTION_ROOTS) {
    for (const file of collectProductionSourceFiles(root)) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /moment-classification/, `${file} still references the deleted moment-classification module`);
      assert.doesNotMatch(source, /setAiClassifiedMoment/, `${file} still references the deleted setAiClassifiedMoment`);
      assert.doesNotMatch(source, /listMomentOverridesForEvent/, `${file} still references the deleted listMomentOverridesForEvent`);
    }
  }
});
