import { NextRequest, NextResponse } from "next/server";
import { verifyMemoriesUploadTicket } from "@/lib/invitations/memories/upload-tickets";
import { markMemoryMediaUploaded } from "@/lib/invitations/memories/repository";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  const { eventId } = params;
  const body = (await request.json()) as { mediaId?: string; ticket?: string };

  if (!body.mediaId || !body.ticket) {
    return NextResponse.json({ error: "missing mediaId or ticket" }, { status: 400 });
  }
  if (!verifyMemoriesUploadTicket(body.ticket, eventId, body.mediaId)) {
    return NextResponse.json({ error: "invalid ticket" }, { status: 403 });
  }

  await markMemoryMediaUploaded(body.mediaId);
  return NextResponse.json({ ok: true });
}
