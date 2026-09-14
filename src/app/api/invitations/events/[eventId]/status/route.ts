import { isSameOrigin } from "@/lib/invitations/auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import {
  getInvitationEventForManagement,
  updateInvitationEventStatus,
} from "@/lib/invitations/repository";
import { parseStatusCommand, validateStatusTransition } from "@/lib/invitations/validation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { command: "Choose a valid invitation status action." } }, { status: 400 });
  }
  const parsed = parseStatusCommand(body);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

  const current = await getInvitationEventForManagement(params.eventId);
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
  const allowPastEvent = Boolean(
    body && typeof body === "object" && "allowPastEvent" in body && body.allowPastEvent === true,
  );
  const errors = validateStatusTransition(current, parsed.command, access.kind, { allowPastEvent });
  if (Object.keys(errors).length) {
    return NextResponse.json({ errors }, { status: "command" in errors ? 409 : 400 });
  }

  try {
    await updateInvitationEventStatus(params.eventId, parsed.status);
    return NextResponse.json({ status: parsed.status });
  } catch (error) {
    console.error("[invitations/events/status] update failed", { eventId: params.eventId, error });
    return NextResponse.json({ errors: { status: "The invitation status could not be changed." } }, { status: 500 });
  }
}
