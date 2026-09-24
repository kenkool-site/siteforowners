import { NextRequest, NextResponse } from "next/server";
import { listGalleryVisibleMedia, toPublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { getEventMemoriesSettings, listMemoryMoments } from "@/lib/invitations/memories/repository";

export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const settings = await getEventMemoriesSettings(params.eventId);
    if (!settings || !settings.memoriesEnabled) {
      return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    }
    // Moments are still returned for the host's own timestamp-based grouping
    // (GuestMomentsView / gallery-view.ts's momentForMedia); AI content-based
    // grouping is a fully independent system served by
    // /api/memories/events/[eventId]/highlights, with no override applied here.
    const [media, moments] = await Promise.all([
      listGalleryVisibleMedia(params.eventId),
      listMemoryMoments(params.eventId),
    ]);
    return NextResponse.json({
      media: media.map((item) => toPublicMemoryMedia(item)),
      moments,
    });
  } catch (error) {
    console.error("[memories/gallery] fetch failed", { error });
    return NextResponse.json({ error: "gallery fetch failed" }, { status: 500 });
  }
}
