import { NextRequest, NextResponse } from "next/server";
import { listGalleryVisibleMedia, toPublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { getEventMemoriesSettings, getPublishedMemoryHighlights } from "@/lib/invitations/memories/repository";
import type { MemoryHighlightGroup } from "@/lib/invitations/memories/highlight-types";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

// Guest-facing read model for Task 4's independent, multi-group AI Highlight
// system — replaces the old single-group-per-photo Moments-based tab
// (aiHighlightGroups in gallery-view.ts, removed by this same task). This
// route is deliberately thin: getPublishedMemoryHighlights already scopes to
// the currently-published generation's visible groups only, so all this does
// is resolve mediaIds into full guest-safe media objects and enforce the
// guest-facing contract boundary itself (never trusting an upstream filter
// to be the only thing standing between a hidden group / internal id and a
// guest response).
//
// dependencies is a DI seam — matching highlight-service.ts's own
// `dependencies = {}` convention — because getEventMemoriesSettings and
// getPublishedMemoryHighlights call createAdminClient() directly and have no
// injection seam of their own (createAdminClient() throws on missing env
// before any query runs; see repository.test.ts's header comment). Without
// this seam, the 404/empty/hidden-group/multi-group behaviors this route is
// responsible for would be untestable without a real Supabase instance. Next
// only ever calls GET with (request, context) in production, so this extra
// parameter is invisible outside of tests.
export interface GuestHighlightsDependencies {
  getEventMemoriesSettings?: typeof getEventMemoriesSettings;
  getPublishedMemoryHighlights?: typeof getPublishedMemoryHighlights;
  listGalleryVisibleMedia?: typeof listGalleryVisibleMedia;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: { eventId: string } },
  dependencies: GuestHighlightsDependencies = {},
) {
  const getSettings = dependencies.getEventMemoriesSettings ?? getEventMemoriesSettings;
  const getPublished = dependencies.getPublishedMemoryHighlights ?? getPublishedMemoryHighlights;
  const listMedia = dependencies.listGalleryVisibleMedia ?? listGalleryVisibleMedia;

  try {
    const settings = await getSettings(params.eventId);
    if (!settings || !settings.memoriesEnabled) {
      return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    }

    const [published, media] = await Promise.all([getPublished(params.eventId), listMedia(params.eventId)]);
    const mediaById = new Map(media.map((item) => [item.id, item]));

    const groups: Array<MemoryHighlightGroup & { media: PublicMemoryMedia[] }> = published.groups
      .filter(({ group }) => group.isVisible)
      .map(({ group, mediaIds }) => ({
        ...group,
        media: mediaIds
          .map((mediaId) => mediaById.get(mediaId))
          .filter((item): item is MemoryMedia => item !== undefined)
          .map((item) => toPublicMemoryMedia(item)),
      }));

    return NextResponse.json({ groups });
  } catch (error) {
    console.error("[memories/highlights] guest fetch failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "highlights fetch failed" }, { status: 500 });
  }
}
