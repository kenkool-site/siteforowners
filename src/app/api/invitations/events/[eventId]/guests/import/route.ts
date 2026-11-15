import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { parseGuestCsv } from "@/lib/invitations/guest-list";
import { guestListErrorResponse } from "@/lib/invitations/guest-list-http";
import { importGuestsToList } from "@/lib/invitations/guest-list-service";

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ ok: false, code: "unauthorized" }, { status: 401 });
  let csv = "";
  try {
    const body = await request.json() as { csv?: unknown };
    csv = typeof body.csv === "string" ? body.csv : "";
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_guest" }, { status: 400 });
  }
  const parsed = parseGuestCsv(csv);
  if (parsed.guests.length === 0) {
    return NextResponse.json({ ok: false, code: "invalid_guest", errors: parsed.errors }, { status: 400 });
  }
  try {
    const result = await importGuestsToList(params.eventId, parsed.guests);
    return NextResponse.json({ ok: true, ...result, errors: parsed.errors });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] import failed");
  }
}
