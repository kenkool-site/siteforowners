import { NextRequest, NextResponse } from "next/server";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { listEventSitePhotos } from "@/lib/invitations/memories/honor-service";

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, false);
  if (denied) return denied;
  try {
    return NextResponse.json({ photos: await listEventSitePhotos(params.eventId) });
  } catch (error) {
    return honorErrorResponse(error);
  }
}
