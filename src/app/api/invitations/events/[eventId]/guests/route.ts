import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { guestListErrorResponse } from "@/lib/invitations/guest-list-http";
import { addGuestToList, loadHostGuestList, removeGuestFromList } from "@/lib/invitations/guest-list-service";

export async function GET(request: NextRequest, { params }: { params: { eventId: string } }) {
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  try {
    const list = await loadHostGuestList(params.eventId);
    return NextResponse.json({ ok: true, ...list }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] list failed");
  }
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  try {
    const guest = await addGuestToList(params.eventId, await request.json());
    return NextResponse.json({ ok: true, guest });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] add failed");
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  const guestId = request.nextUrl.searchParams.get("guestId") ?? "";
  try {
    await removeGuestFromList(params.eventId, guestId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] remove failed");
  }
}
