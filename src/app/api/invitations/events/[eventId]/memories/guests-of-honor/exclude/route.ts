import { NextRequest, NextResponse } from "next/server";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { excludeHonorPhoto } from "@/lib/invitations/memories/honor-service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, true);
  if (denied) return denied;
  try {
    const body = await request.json() as { mediaId?: string };
    if (!body.mediaId || !UUID.test(body.mediaId)) return NextResponse.json({ error: "invalid media" }, { status: 400 });
    return NextResponse.json(await excludeHonorPhoto(params.eventId, body.mediaId));
  } catch (error) {
    return honorErrorResponse(error);
  }
}
