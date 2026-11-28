import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { deleteOwnMemoryMedia } from "@/lib/invitations/memories/guest-delete";
import { verifyMemoriesGuestSession } from "@/lib/invitations/memories/guest-session";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A guest removing their own accidental upload. The signed guest session must
// still be valid and the upload young enough (see guest-delete.ts); everything
// else - including the host - goes through the moderation routes instead.
export async function DELETE(request: NextRequest, { params }: { params: { eventId: string; mediaId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  if (!UUID.test(params.mediaId)) return NextResponse.json({ error: "invalid mediaId" }, { status: 400 });
  const token = request.cookies.get("memories_guest_session")?.value;
  const session = token ? verifyMemoriesGuestSession(token, params.eventId) : null;
  if (!session?.sessionId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const outcome = await deleteOwnMemoryMedia(params.eventId, params.mediaId, session.sessionId);
    if (outcome === "deleted") return NextResponse.json({ ok: true });
    if (outcome === "window_closed") return NextResponse.json({ error: "too late to remove this upload", code: "window_closed" }, { status: 410 });
    if (outcome === "not_owner") return NextResponse.json({ error: "not your upload" }, { status: 403 });
    return NextResponse.json({ error: "not found" }, { status: 404 });
  } catch (error) {
    console.error("[memories/media] guest delete failed", { eventId: params.eventId, mediaId: params.mediaId, error });
    return NextResponse.json({ error: "delete failed" }, { status: 500 });
  }
}
