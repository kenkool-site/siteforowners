import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { guestListErrorResponse } from "@/lib/invitations/guest-list-http";
import { submitPersonalInvitationRsvp } from "@/lib/invitations/guest-list-service";
import { revalidateInvitationPage } from "@/lib/invitations/revalidate-invitation-page";
import { getGuestByToken } from "@/lib/invitations/guest-list-store";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ ok: false, code: "forbidden" }, { status: 403 });
  let body: { token?: unknown; attending?: unknown; partySize?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, code: "invalid_party" }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token : "";
  const attending = body.attending === true;
  const partySize = Number(body.partySize);
  try {
    const saved = await submitPersonalInvitationRsvp({
      token,
      attending,
      partySize,
      origin: request.nextUrl.origin,
    });
    const loaded = await getGuestByToken(token);
    if (loaded) revalidateInvitationPage(loaded.event.slug);
    return NextResponse.json({ ok: true, ...saved });
  } catch (error) {
    return guestListErrorResponse(error, "[guest-list] personal rsvp failed");
  }
}
