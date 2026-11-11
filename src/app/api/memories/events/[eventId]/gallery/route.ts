import { NextRequest, NextResponse } from "next/server";
import { listGalleryVisibleMedia, toPublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { viewerMediaIdsForSession } from "@/lib/invitations/memories/guest-presentation";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";
import { getEventMemoriesSettings, listMemoryMoments } from "@/lib/invitations/memories/repository";

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
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
    // "Added by you" only when this browser's signed session matches. Other
    // guests' session ids never leave the server.
    let viewerMediaIds: string[] = [];
    let viewerKnown = false;
    const token = request.cookies.get("memories_guest_session")?.value;
    if (token) {
      try {
        const session = verifyMemoriesGuestSession(token, params.eventId);
        if (session) {
          viewerKnown = true;
          viewerMediaIds = viewerMediaIdsForSession(media, session);
        }
      } catch (error) {
        console.error("[memories/gallery] viewer session check failed", { error });
      }
    }
    return NextResponse.json({
      media: media.map((item) => toPublicMemoryMedia(item)),
      moments,
      viewerMediaIds,
      viewerKnown,
    });
  } catch (error) {
    console.error("[memories/gallery] fetch failed", { error });
    return NextResponse.json({ error: "gallery fetch failed" }, { status: 500 });
  }
}
