import { NextRequest, NextResponse } from "next/server";
import { listGalleryVisibleMedia, toPublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { getEventMemoriesSettings, getPublishedMemoryHighlights } from "@/lib/invitations/memories/repository";
import type { MemoryHighlightGroup } from "@/lib/invitations/memories/highlight-types";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

// Guest-facing read model for Task 4's independent, multi-group AI Highlight
// system — replaces the old single-group-per-photo Moments-based tab
// (aiHighlightGroups in gallery-view.ts, removed by this same task).
// getPublishedMemoryHighlights already scopes to the currently-published
// generation's visible groups only, so all this does is resolve mediaIds
// into full guest-safe media objects and enforce the guest-facing contract
// boundary itself (never trusting an upstream filter to be the only thing
// standing between a hidden group / internal id and a guest response).
export interface GuestHighlightsDependencies {
  getEventMemoriesSettings?: typeof getEventMemoriesSettings;
  getPublishedMemoryHighlights?: typeof getPublishedMemoryHighlights;
  listGalleryVisibleMedia?: typeof listGalleryVisibleMedia;
}

export interface GuestHighlightsResult {
  groups: Array<MemoryHighlightGroup & { media: PublicMemoryMedia[] }>;
}

// Core read-model logic, factored out from the GET handler so tests can
// inject fakes for every DB-touching seam without a real Supabase instance —
// mirroring this plan's own established DI pattern (highlight-service.ts's
// `dependencies` parameter) at the route layer exactly the way
// src/app/api/cron/memories-highlights/route.ts's runMemoriesHighlightsCron
// already does: the factored function takes the DI seam, the exported GET
// keeps the plain, standard Next.js signature and simply calls it with no
// arguments. getEventMemoriesSettings/getPublishedMemoryHighlights call
// createAdminClient() directly and have no injection seam of their own
// (createAdminClient() throws on missing env before any query runs; see
// repository.test.ts's header comment), which is why this seam exists at
// all — without it, the 404/empty/hidden-group/multi-group behaviors this
// route is responsible for would be untestable without a real Supabase
// instance.
//
// Returns null to mean "this event doesn't serve guest highlights right
// now" (memories disabled, or no settings row at all) — GET maps that to
// 404.
export async function getGuestHighlightsForEvent(
  eventId: string,
  dependencies: GuestHighlightsDependencies = {},
): Promise<GuestHighlightsResult | null> {
  const getSettings = dependencies.getEventMemoriesSettings ?? getEventMemoriesSettings;
  const getPublished = dependencies.getPublishedMemoryHighlights ?? getPublishedMemoryHighlights;
  const listMedia = dependencies.listGalleryVisibleMedia ?? listGalleryVisibleMedia;

  const settings = await getSettings(eventId);
  if (!settings || !settings.memoriesEnabled) return null;

  const [published, media] = await Promise.all([getPublished(eventId), listMedia(eventId)]);
  const mediaById = new Map(media.map((item) => [item.id, item]));

  // Defense in depth: getPublishedMemoryHighlights already scopes to
  // is_visible groups under the published generation only, but this is the
  // guest-facing contract boundary — a hidden group or an internal field
  // (generationId, descriptor/confidence data, error codes) must never reach
  // a guest even if that upstream filter ever changes.
  const groups: GuestHighlightsResult["groups"] = published.groups
    .filter(({ group }) => group.isVisible)
    .map(({ group, mediaIds }) => ({
      ...group,
      media: mediaIds
        .map((mediaId) => mediaById.get(mediaId))
        .filter((item): item is MemoryMedia => item !== undefined)
        .map((item) => toPublicMemoryMedia(item)),
    }));

  return { groups };
}

export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const result = await getGuestHighlightsForEvent(params.eventId);
    if (!result) return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    console.error("[memories/highlights] guest fetch failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "highlights fetch failed" }, { status: 500 });
  }
}
