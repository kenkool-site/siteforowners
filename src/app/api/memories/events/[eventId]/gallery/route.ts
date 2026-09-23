import { NextRequest, NextResponse } from "next/server";
import { listGalleryVisibleMedia, toPublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { getEventMemoriesSettings, listMemoryMoments, listMomentOverridesForEvent } from "@/lib/invitations/memories/repository";

export async function GET(_request: NextRequest, { params }: { params: { eventId: string } }) {
  try {
    const settings = await getEventMemoriesSettings(params.eventId);
    if (!settings || !settings.memoriesEnabled) {
      return NextResponse.json({ error: "memories not enabled for this event" }, { status: 404 });
    }
    const [media, moments] = await Promise.all([
      listGalleryVisibleMedia(params.eventId),
      listMemoryMoments(params.eventId),
    ]);
    const overrides = await listMomentOverridesForEvent(moments.map((moment) => moment.id));
    return NextResponse.json({
      media: media.map((item) => toPublicMemoryMedia(item, overrides[item.id] ?? null)),
      moments,
    });
  } catch (error) {
    console.error("[memories/gallery] fetch failed", { error });
    return NextResponse.json({ error: "gallery fetch failed" }, { status: 500 });
  }
}
