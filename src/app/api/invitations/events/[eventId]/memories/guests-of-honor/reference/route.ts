import { NextRequest, NextResponse } from "next/server";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { honorReferenceKey, readHonorObject } from "@/lib/invitations/memories/honor-service";

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, false);
  if (denied) return denied;
  try {
    const bytes = await readHonorObject(params.eventId, honorReferenceKey(params.eventId));
    if (!bytes) return NextResponse.json({ error: "photo not found" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return honorErrorResponse(error);
  }
}
