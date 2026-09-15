import { hashPin } from "@/lib/admin-auth";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import {
  getInvitationEventForManagement,
  updateInvitationOwnerCredentials,
} from "@/lib/invitations/repository";
import { parseOwnerCredentialUpdate } from "@/lib/invitations/validation";
import { NextRequest, NextResponse } from "next/server";

function isDuplicateOwnerEmail(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const cause = error.cause as { code?: unknown; message?: unknown } | undefined;
  const message = `${error.message} ${typeof cause?.message === "string" ? cause.message : ""}`.toLowerCase();
  return cause?.code === "23505" || message.includes("duplicate") || message.includes("unique");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }
  const access = await requireInvitationAccess(request, params.eventId);
  if (access?.kind !== "founder") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const current = await getInvitationEventForManagement(params.eventId);
  if (!current) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ errors: { form: "Send valid owner details." } }, { status: 400 });
  }
  const parsed = parseOwnerCredentialUpdate(body);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

  try {
    const pinHash = parsed.value.newOwnerPin ? await hashPin(parsed.value.newOwnerPin) : undefined;
    await updateInvitationOwnerCredentials(current.ownerId, parsed.value, pinHash);
    const event = await getInvitationEventForManagement(params.eventId);
    if (!event) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    return NextResponse.json({ event });
  } catch (error) {
    console.error("[invitations/events/credentials] update failed", { eventId: params.eventId, error });
    if (isDuplicateOwnerEmail(error)) {
      return NextResponse.json({ errors: { ownerEmailTaken: "That owner email is already in use." } }, { status: 409 });
    }
    return NextResponse.json({ errors: { form: "Owner credentials could not be saved." } }, { status: 500 });
  }
}
