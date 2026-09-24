import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { NextRequest } from "next/server";
import { GET, getGuestHighlightsForEvent } from "./route";
import type { GuestHighlightsDependencies } from "./route";
import type { MemoryHighlightGroup, PublishedMemoryHighlights } from "@/lib/invitations/memories/highlight-types";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

const EVENT_ID = "event-1";
const BASE_URL = `http://localhost:3000/api/memories/events/${EVENT_ID}/highlights`;

function request(): NextRequest {
  return new NextRequest(new URL(BASE_URL));
}

function enabledSettings() {
  return { memoriesEnabled: true, memoriesMode: "auto_publish" as const, startsAt: null };
}

function group(overrides: Partial<MemoryHighlightGroup> & { id: string }): MemoryHighlightGroup {
  return {
    eventId: EVENT_ID,
    name: "Cake",
    description: null,
    semanticKey: overrides.id,
    source: "fallback",
    sortOrder: 0,
    isVisible: true,
    ...overrides,
  };
}

function media(overrides: Partial<MemoryMedia> & { id: string }): MemoryMedia {
  return {
    eventId: EVENT_ID,
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
    moderationStatus: "approved",
    aiStatus: "complete",
    moderationScore: null,
    moderationCategories: null,
    ...overrides,
  } as MemoryMedia;
}

function published(overrides: Partial<PublishedMemoryHighlights> = {}): PublishedMemoryHighlights {
  return { generationId: "gen-1", groups: [], ...overrides };
}

// A fully "never called" set of no-op dependencies, so each test only has to
// override the seams it actually exercises — mirrors
// memories-highlights-route.test.ts's own noopDependencies() convention for
// this same plan's other DI-factored route.
function noopDependencies(): GuestHighlightsDependencies {
  return {
    getEventMemoriesSettings: async () => enabledSettings(),
    getPublishedMemoryHighlights: async () => published(),
    listGalleryVisibleMedia: async () => [],
  };
}

test("highlights route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
  assert.equal(typeof mod.getGuestHighlightsForEvent, "function");
});

// ---------------------------------------------------------------------------
// GET (framework-facing entry point only — plain Next.js signature, no DI
// parameter of its own, matching runMemoriesHighlightsCron's route.ts
// convention). Everything past this thin wrapper is exercised directly
// against getGuestHighlightsForEvent below.
// ---------------------------------------------------------------------------

test("GET reaches the real getGuestHighlightsForEvent and its own try/catch converts a thrown error into a 500 (no Supabase env configured in this test environment)", async () => {
  const response = await GET(request(), { params: { eventId: EVENT_ID } });
  assert.equal(response.status, 500);
  const body = (await response.json()) as { error: string };
  assert.equal(typeof body.error, "string");
  assert.doesNotMatch(body.error, /supabaseUrl|SUPABASE|createAdminClient/i);
});

// Structural: GET's own null->404 / success->200-json mapping isn't
// independently reachable without a real Supabase instance (see the test
// above), so — matching this codebase's established convention for
// unreachable-without-DB route wiring (e.g. the owner-facing
// highlights-route.test.ts's own structural checks) — this asserts the
// source actually wires the mapping in.
test("GET maps a null result to 404 and forwards a non-null result as JSON", () => {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!result\)/);
  assert.match(source, /status: 404/);
  assert.match(source, /NextResponse\.json\(result\)/);
});

// ---------------------------------------------------------------------------
// getGuestHighlightsForEvent — the actual read-model logic, DI-injectable so
// every behavior the brief requires can be verified without a real Supabase
// instance.
// ---------------------------------------------------------------------------

test("returns null when memories are disabled for the event", async () => {
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getEventMemoriesSettings: async () => ({ memoriesEnabled: false, memoriesMode: "auto_publish", startsAt: null }),
  });
  assert.equal(result, null);
});

test("returns null when the event has no memories settings row at all (offline/deleted event)", async () => {
  const result = await getGuestHighlightsForEvent(EVENT_ID, { ...noopDependencies(), getEventMemoriesSettings: async () => null });
  assert.equal(result, null);
});

test("returns { groups: [] } when memories are enabled but no generation has ever published", async () => {
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getPublishedMemoryHighlights: async () => published({ generationId: null, groups: [] }),
  });
  assert.deepEqual(result, { groups: [] });
});

test("resolves each group's mediaIds into full PublicMemoryMedia via toPublicMemoryMedia", async () => {
  const g1 = group({ id: "group-1", name: "Cake Cutting" });
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getPublishedMemoryHighlights: async () => published({ groups: [{ group: g1, mediaIds: ["m1", "m2"] }] }),
    listGalleryVisibleMedia: async () => [media({ id: "m1" }), media({ id: "m2" })],
  });
  assert.ok(result);
  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]!.id, "group-1");
  assert.equal(result.groups[0]!.name, "Cake Cutting");
  const mediaIds = result.groups[0]!.media.map((item) => item.id).sort();
  assert.deepEqual(mediaIds, ["m1", "m2"]);
  assert.equal(result.groups[0]!.media.find((item) => item.id === "m1")?.objectKeyDisplay, "display/m1.webp");
});

test("excludes a hidden group even if the injected dependency includes one (defense in depth)", async () => {
  const visible = group({ id: "visible-group", isVisible: true });
  const hidden = group({ id: "hidden-group", isVisible: false });
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getPublishedMemoryHighlights: async () =>
      published({
        groups: [
          { group: visible, mediaIds: [] },
          { group: hidden, mediaIds: [] },
        ],
      }),
  });
  assert.ok(result);
  assert.deepEqual(
    result.groups.map((g) => g.id),
    ["visible-group"],
  );
});

test("a media item assigned to multiple published groups appears in every one of those groups", async () => {
  const g1 = group({ id: "group-1", name: "Cake" });
  const g2 = group({ id: "group-2", name: "Dancing" });
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getPublishedMemoryHighlights: async () =>
      published({
        groups: [
          { group: g1, mediaIds: ["shared-media"] },
          { group: g2, mediaIds: ["shared-media"] },
        ],
      }),
    listGalleryVisibleMedia: async () => [media({ id: "shared-media" })],
  });
  assert.ok(result);
  assert.equal(result.groups.length, 2);
  for (const g of result.groups) {
    assert.deepEqual(
      g.media.map((item) => item.id),
      ["shared-media"],
    );
  }
});

test("the result never exposes generationId or any other internal generation identifier", async () => {
  const g1 = group({ id: "group-1" });
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getPublishedMemoryHighlights: async () => published({ generationId: "gen-should-not-leak", groups: [{ group: g1, mediaIds: [] }] }),
  });
  const rawText = JSON.stringify(result);
  assert.doesNotMatch(rawText, /generationId/);
  assert.doesNotMatch(rawText, /gen-should-not-leak/);
});

test("a mediaId referenced by a published group but missing from the gallery-visible media list is silently dropped, not a crash", async () => {
  const g1 = group({ id: "group-1" });
  const result = await getGuestHighlightsForEvent(EVENT_ID, {
    ...noopDependencies(),
    getPublishedMemoryHighlights: async () => published({ groups: [{ group: g1, mediaIds: ["ghost-media"] }] }),
    listGalleryVisibleMedia: async () => [], // ghost-media no longer gallery-visible (e.g. unapproved after publish)
  });
  assert.ok(result);
  assert.deepEqual(result.groups[0]!.media, []);
});

test("propagates a dependency's thrown error rather than swallowing it (GET's own try/catch is what converts this to a 500)", async () => {
  await assert.rejects(
    () =>
      getGuestHighlightsForEvent(EVENT_ID, {
        ...noopDependencies(),
        getPublishedMemoryHighlights: async () => {
          throw new Error("db exploded");
        },
      }),
    /db exploded/,
  );
});
