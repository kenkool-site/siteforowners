import { hashPin } from "@/lib/admin-auth";
import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import {
  getInvitationEventForManagement,
  updateInvitationEvent,
  updateInvitationOwnerCredentials,
} from "@/lib/invitations/repository";
import { parseEventUpdate } from "@/lib/invitations/validation";
import { NextRequest, NextResponse } from "next/server";

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
    const [passcodeHash, ownerPinHash] = await Promise.all([
      parsed.value.passcode ? hashPin(parsed.value.passcode) : undefined,
      parsed.value.newOwnerPin ? hashPin(parsed.value.newOwnerPin) : undefined,
    ]);
    await updateInvitationEvent(params.eventId, parsed.value, passcodeHash);
    if (access.kind === "founder") {
      await updateInvitationOwnerCredentials(current.ownerId, parsed.value, ownerPinHash);
    }
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("[invitations/events] update failed", { eventId: params.eventId, error });
    return NextResponse.json({ errors: { form: "Changes could not be saved." } }, { status: 500 });
  }
}
