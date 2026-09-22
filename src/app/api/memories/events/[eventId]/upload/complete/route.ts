import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { verifyMemoriesUploadTicket } from "@/lib/invitations/memories/upload-tickets";
import { markMemoryMediaUploaded } from "@/lib/invitations/memories/repository";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }

  try {
    const { eventId } = params;
    const parsedBody = body as { mediaId?: string; ticket?: string };

    if (!parsedBody.mediaId || !parsedBody.ticket) {
      return NextResponse.json({ error: "missing mediaId or ticket" }, { status: 400 });
    }
    if (!verifyMemoriesUploadTicket(parsedBody.ticket, eventId, parsedBody.mediaId)) {
      return NextResponse.json({ error: "invalid ticket" }, { status: 403 });
    }

    await markMemoryMediaUploaded(parsedBody.mediaId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[memories/upload/complete] submission failed", { error });
    return NextResponse.json({ error: "upload completion failed" }, { status: 500 });
  }
}
