import { NextRequest, NextResponse } from "next/server";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { getHostHonorState, removeHonorTagging } from "@/lib/invitations/memories/honor-service";

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, false);
  if (denied) return denied;
  try {
    return NextResponse.json(await getHostHonorState(params.eventId));
  } catch (error) {
    return honorErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, true);
  if (denied) return denied;
  try {
    await removeHonorTagging(params.eventId);
    return NextResponse.json(await getHostHonorState(params.eventId));
  } catch (error) {
    return honorErrorResponse(error);
  }
}
