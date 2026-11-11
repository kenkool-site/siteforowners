import { NextRequest, NextResponse } from "next/server";
import { honorErrorResponse, honorHostGuard } from "@/lib/invitations/memories/honor-http";
import { detectHonorFaces, getHostHonorState } from "@/lib/invitations/memories/honor-service";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const denied = await honorHostGuard(request, params.eventId, true);
  if (denied) return denied;
  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("photo");
      if (!(file instanceof File)) return NextResponse.json({ error: "photo not found" }, { status: 400 });
      const bytes = new Uint8Array(await file.arrayBuffer());
      await detectHonorFaces({ eventId: params.eventId, sourceKind: "upload", bytes });
    } else {
      const body = await request.json() as { sourceKind?: string; sourceRef?: string };
      if (body.sourceKind !== "event_site" || typeof body.sourceRef !== "string" || !body.sourceRef) {
        return NextResponse.json({ error: "photo not found" }, { status: 400 });
      }
      await detectHonorFaces({ eventId: params.eventId, sourceKind: "event_site", sourceRef: body.sourceRef });
    }
    return NextResponse.json(await getHostHonorState(params.eventId));
  } catch (error) {
    return honorErrorResponse(error);
  }
}
