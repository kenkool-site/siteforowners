import { hashPin } from "@/lib/admin-auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { canManageInvitationCohost, parseInvitationCohostInput } from "@/lib/invitations/hosts";
import {
  getInvitationEventForManagement,
  removeInvitationCohost,
  setInvitationCohost,
} from "@/lib/invitations/repository";
import { NextRequest, NextResponse } from "next/server";

async function authorize(request: NextRequest, eventId: string) {
  const access = await requireInvitationAccess(request, eventId);
  const event = await getInvitationEventForManagement(eventId);
  if (!event) return { response: NextResponse.json({ error: "Invitation not found" }, { status: 404 }) };
  if (!access) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!canManageInvitationCohost(access, event.ownerId)) {
    return { response: NextResponse.json({ error: "Only the primary host can manage co-host access" }, { status: 403 }) };
  }
  return { event };
}

export async function POST(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const authorized = await authorize(request, params.eventId);
  if ("response" in authorized) return authorized.response;

  let body: unknown;
  try { body = await request.json(); }
  catch { return NextResponse.json({ errors: { form: "Send valid co-host details." } }, { status: 400 }); }
  const parsed = parseInvitationCohostInput(body);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

  try {
    const result = await setInvitationCohost(params.eventId, parsed.value, await hashPin(parsed.value.pin));
    const event = await getInvitationEventForManagement(params.eventId);
    return NextResponse.json({ event, reused: result.reused });
  } catch (error) {
    console.error("[invitations/events/cohost] save failed", { eventId: params.eventId, error });
    return NextResponse.json({ errors: { form: "Co-host access could not be saved." } }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { eventId: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  const authorized = await authorize(request, params.eventId);
  if ("response" in authorized) return authorized.response;
  try {
    await removeInvitationCohost(params.eventId);
    const event = await getInvitationEventForManagement(params.eventId);
    return NextResponse.json({ event });
  } catch (error) {
    console.error("[invitations/events/cohost] remove failed", { eventId: params.eventId, error });
    return NextResponse.json({ errors: { form: "Co-host access could not be removed." } }, { status: 500 });
  }
}
