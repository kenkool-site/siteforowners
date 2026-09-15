import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readOwnerSession, type OwnerSession } from "./auth";
import { isInvitationE2EFixturesEnabled } from "./e2e-guard";

export type InvitationAccess =
  | { kind: "founder" }
  | { kind: "owner"; ownerId: string };

export type InvitationAccessInput = {
  adminSessionValue: string | undefined;
  adminPassword: string | undefined;
  ownerSession: OwnerSession | null;
  eventId: string;
  ownerOwnsEvent(ownerId: string, eventId: string): Promise<boolean>;
};

export async function invitationOwnerOwnsEvent(
  ownerId: string,
  eventId: string,
): Promise<boolean> {
  if (isInvitationE2EFixturesEnabled()) {
    const { fixtureOwnerOwnsEvent } = await import("./e2e-fixtures");
    return fixtureOwnerOwnsEvent(ownerId, eventId);
  }
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invitation_event_hosts")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("[invitations/access] event ownership lookup failed", { ownerId, eventId, error });
    return false;
  }
  return data !== null;
}

export async function resolveInvitationAccess(
  input: InvitationAccessInput,
): Promise<InvitationAccess | null> {
  if (input.adminPassword && input.adminSessionValue === input.adminPassword) {
    return { kind: "founder" };
  }
  if (!input.ownerSession) return null;
  const ownsEvent = await input.ownerOwnsEvent(input.ownerSession.ownerId, input.eventId);
  return ownsEvent ? { kind: "owner", ownerId: input.ownerSession.ownerId } : null;
}

export async function requireInvitationAccess(
  request: NextRequest,
  eventId: string,
): Promise<InvitationAccess | null> {
  const adminSessionValue = request.cookies.get("admin_session")?.value;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword && adminSessionValue === adminPassword) return { kind: "founder" };

  return resolveInvitationAccess({
    adminSessionValue,
    adminPassword,
    ownerSession: readOwnerSession(request),
    eventId,
    ownerOwnsEvent: invitationOwnerOwnsEvent,
  });
}
