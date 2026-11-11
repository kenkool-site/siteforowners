import { NextRequest, NextResponse } from "next/server";
import type { HonorFaceDraft } from "@/lib/invitations/memories/guests-of-honor";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { confirmHonorFaces } from "@/lib/invitations/memories/honor-service";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, true);
  if (denied) return denied;
  try {
    const body = await request.json() as { consent?: boolean; faces?: HonorFaceDraft[] };
    if (!Array.isArray(body.faces) || body.faces.some((face) => typeof face?.index !== "number" || typeof face?.name !== "string" || typeof face?.roleKey !== "string" || typeof face?.selected !== "boolean")) {
      return NextResponse.json({ error: "invalid faces" }, { status: 400 });
    }
    const state = await confirmHonorFaces(params.eventId, body.faces, body.consent === true);
    return NextResponse.json(state);
  } catch (error) {
    return honorErrorResponse(error);
  }
}
