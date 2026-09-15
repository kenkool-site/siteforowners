import { NextRequest, NextResponse } from "next/server";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";
import { invitationSubdomainRepository } from "@/lib/invitations/subdomain-repository";
import { findAvailableInvitationSubdomain } from "@/lib/invitations/subdomains";

export async function GET(request: NextRequest) {
  const authorized = hasFounderInvitationSession(
    process.env.ADMIN_PASSWORD,
    request.cookies.get("admin_session")?.value,
  );
  if (!authorized) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const value = request.nextUrl.searchParams.get("value") ?? "";
  const eventId = request.nextUrl.searchParams.get("eventId");
  if (value.length > 100 || (eventId && !/^[0-9a-f-]{36}$/i.test(eventId))) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    return NextResponse.json(
      await findAvailableInvitationSubdomain(value, eventId, invitationSubdomainRepository),
    );
  } catch (error) {
    console.error("[invitations/subdomains] availability failed", { error });
    return NextResponse.json({ error: "Unable to check public address" }, { status: 503 });
  }
}
