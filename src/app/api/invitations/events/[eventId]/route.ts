import { hashPin } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import {
  getInvitationEventForManagement,
  updateInvitationEvent,
} from "@/lib/invitations/repository";
import { parseEventUpdate } from "@/lib/invitations/validation";
import { NextRequest, NextResponse } from "next/server";
import { isPlatformSubdomainTakenError } from "@/lib/invitations/subdomains";

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getInvitationEventForManagement(params.eventId);
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Send valid event details." } }, { status: 400 });
  }
  const parsed = parseEventUpdate(body, access.kind, current);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

  try {
    const passcodeHash = parsed.value.passcode ? await hashPin(parsed.value.passcode) : undefined;
    await updateInvitationEvent(params.eventId, parsed.value, passcodeHash);
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    if (isPlatformSubdomainTakenError(error)) {
      return NextResponse.json({ errors: { publicSubdomain: "already_in_use" } }, { status: 409 });
    }
    if (error instanceof Error && error.message === "INVITE_CAPACITY_BELOW_ATTENDANCE") {
      return NextResponse.json({ errors: { capacity: "below_attendance" } }, { status: 409 });
    }
    console.error("[invitations/events] update failed", { eventId: params.eventId, error });
    return NextResponse.json({ errors: { form: "Changes could not be saved." } }, { status: 500 });
  }
}
