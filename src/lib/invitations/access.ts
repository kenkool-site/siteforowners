import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { readOwnerSession } from "./auth";

export type InvitationAccess =
  | { kind: "founder" }
  | { kind: "owner"; ownerId: string };

export async function invitationOwnerOwnsEvent(
  ownerId: string,
  eventId: string,
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("invitation_events")
    .select("id")
    .eq("id", eventId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (error) {
    console.error("[invitations/access] event ownership lookup failed", { ownerId, eventId, error });
    return false;
  }
  return data !== null;
}

export async function requireInvitationAccess(
  request: NextRequest,
  eventId: string,
): Promise<InvitationAccess | null> {
  if (
    process.env.ADMIN_PASSWORD &&
    request.cookies.get("admin_session")?.value === process.env.ADMIN_PASSWORD
  ) {
    return { kind: "founder" };
  }
  const session = readOwnerSession(request);
  if (!session) return null;
  const ownsEvent = await invitationOwnerOwnsEvent(session.ownerId, eventId);
  return ownsEvent ? { kind: "owner", ownerId: session.ownerId } : null;
}
