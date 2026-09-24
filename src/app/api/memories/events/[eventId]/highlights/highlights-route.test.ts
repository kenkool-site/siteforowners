import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
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

function deps(overrides: Partial<GuestHighlightsDependencies> = {}): GuestHighlightsDependencies {
  return {
    getEventMemoriesSettings: async () => enabledSettings(),
    getPublishedMemoryHighlights: async () => published(),
    listGalleryVisibleMedia: async () => [],
    ...overrides,
  };
}

test("highlights route module loads under tsx --test", async () => {
  const mod = await import("./route");
  assert.equal(typeof mod.GET, "function");
});

test("GET returns 404 when memories are disabled for the event", async () => {
  const { GET } = await import("./route");
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({ getEventMemoriesSettings: async () => ({ memoriesEnabled: false, memoriesMode: "auto_publish", startsAt: null }) }),
  );
  assert.equal(response.status, 404);
});

test("GET returns 404 when the event has no memories settings row at all (offline/deleted event)", async () => {
  const { GET } = await import("./route");
  const response = await GET(request(), { params: { eventId: EVENT_ID } }, deps({ getEventMemoriesSettings: async () => null }));
  assert.equal(response.status, 404);
});

test("GET returns { groups: [] } when memories are enabled but no generation has ever published", async () => {
  const { GET } = await import("./route");
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({ getPublishedMemoryHighlights: async () => published({ generationId: null, groups: [] }) }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { groups: unknown[] };
  assert.deepEqual(body, { groups: [] });
});

test("GET resolves each group's mediaIds into full PublicMemoryMedia via toPublicMemoryMedia", async () => {
  const { GET } = await import("./route");
  const g1 = group({ id: "group-1", name: "Cake Cutting" });
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({
      getPublishedMemoryHighlights: async () => published({ groups: [{ group: g1, mediaIds: ["m1", "m2"] }] }),
      listGalleryVisibleMedia: async () => [media({ id: "m1" }), media({ id: "m2" })],
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { groups: Array<MemoryHighlightGroup & { media: Array<{ id: string; objectKeyDisplay: string | null }> }> };
  assert.equal(body.groups.length, 1);
  assert.equal(body.groups[0]!.id, "group-1");
  assert.equal(body.groups[0]!.name, "Cake Cutting");
  const mediaIds = body.groups[0]!.media.map((item) => item.id).sort();
  assert.deepEqual(mediaIds, ["m1", "m2"]);
  assert.equal(body.groups[0]!.media.find((item) => item.id === "m1")?.objectKeyDisplay, "display/m1.webp");
});

test("GET excludes a hidden group even if the injected dependency includes one (defense in depth)", async () => {
  const { GET } = await import("./route");
  const visible = group({ id: "visible-group", isVisible: true });
  const hidden = group({ id: "hidden-group", isVisible: false });
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({
      getPublishedMemoryHighlights: async () =>
        published({
          groups: [
            { group: visible, mediaIds: [] },
            { group: hidden, mediaIds: [] },
          ],
        }),
    }),
  );
  const body = (await response.json()) as { groups: MemoryHighlightGroup[] };
  assert.deepEqual(
    body.groups.map((g) => g.id),
    ["visible-group"],
  );
});

test("a media item assigned to multiple published groups appears in every one of those groups", async () => {
  const { GET } = await import("./route");
  const g1 = group({ id: "group-1", name: "Cake" });
  const g2 = group({ id: "group-2", name: "Dancing" });
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({
      getPublishedMemoryHighlights: async () =>
        published({
          groups: [
            { group: g1, mediaIds: ["shared-media"] },
            { group: g2, mediaIds: ["shared-media"] },
          ],
        }),
      listGalleryVisibleMedia: async () => [media({ id: "shared-media" })],
    }),
  );
  const body = (await response.json()) as { groups: Array<{ id: string; media: Array<{ id: string }> }> };
  assert.equal(body.groups.length, 2);
  for (const g of body.groups) {
    assert.deepEqual(
      g.media.map((item) => item.id),
      ["shared-media"],
    );
  }
});

test("the response never exposes generationId or any other internal generation identifier", async () => {
  const { GET } = await import("./route");
  const g1 = group({ id: "group-1" });
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({
      getPublishedMemoryHighlights: async () => published({ generationId: "gen-should-not-leak", groups: [{ group: g1, mediaIds: [] }] }),
    }),
  );
  const rawText = await response.text();
  assert.doesNotMatch(rawText, /generationId/);
  assert.doesNotMatch(rawText, /gen-should-not-leak/);
});

test("a mediaId referenced by a published group but missing from the gallery-visible media list is silently dropped, not a crash", async () => {
  const { GET } = await import("./route");
  const g1 = group({ id: "group-1" });
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({
      getPublishedMemoryHighlights: async () => published({ groups: [{ group: g1, mediaIds: ["ghost-media"] }] }),
      listGalleryVisibleMedia: async () => [], // ghost-media no longer gallery-visible (e.g. unapproved after publish)
    }),
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as { groups: Array<{ media: unknown[] }> };
  assert.deepEqual(body.groups[0]!.media, []);
});

test("GET returns 500 without leaking internal error detail when a dependency throws", async () => {
  const { GET } = await import("./route");
  const response = await GET(
    request(),
    { params: { eventId: EVENT_ID } },
    deps({ getPublishedMemoryHighlights: async () => { throw new Error("db exploded"); } }),
  );
  assert.equal(response.status, 500);
  const body = (await response.json()) as { error: string };
  assert.doesNotMatch(body.error, /db exploded/);
});
