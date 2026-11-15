import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { guestListErrorResponse } from "@/lib/invitations/guest-list-http";
import { previewGuestMessages, sendGuestMessages } from "@/lib/invitations/guest-list-service";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  let kind: "invite" | "reminder" = "invite";
  let action: "preview" | "send" = "preview";
  try {
    const body = await request.json() as { kind?: unknown; action?: unknown };
    if (body.kind === "reminder") kind = "reminder";
    if (body.action === "send") action = "send";
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_guest" }, { status: 400 });
  }
  try {
    if (action === "preview") {
      return NextResponse.json({ ok: true, ...(await previewGuestMessages(params.eventId, kind)) });
    }
    const result = await sendGuestMessages(params.eventId, kind, request.nextUrl.origin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] messages failed");
  }
}
