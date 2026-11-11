import { NextRequest, NextResponse } from "next/server";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { honorCropKey, readHonorObject } from "@/lib/invitations/memories/honor-service";

export async function GET(request: NextRequest, { params }: { params: { eventId: string; index: string } }) {
  const denied = await honorHostGuard(request, params.eventId, false);
  if (denied) return denied;
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0 || index > 20) {
    return NextResponse.json({ error: "photo not found" }, { status: 404 });
  }
  try {
    const bytes = await readHonorObject(params.eventId, honorCropKey(params.eventId, index));
    if (!bytes) return NextResponse.json({ error: "photo not found" }, { status: 404 });
    return new NextResponse(Buffer.from(bytes), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    return honorErrorResponse(error);
  }
}
