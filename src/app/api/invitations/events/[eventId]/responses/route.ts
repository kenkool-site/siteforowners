import { NextRequest, NextResponse } from "next/server";
import { requireInvitationAccess } from "@/lib/invitations/access";
import { isSameOrigin } from "@/lib/invitations/auth";
import { getInvitationResponsesDashboard } from "@/lib/invitations/repository";
import { submitInvitationRsvp, type RsvpErrorCode } from "@/lib/invitations/rsvp";
import { parseRsvpInput } from "@/lib/invitations/validation";
import { administrativeRsvpAuditMetadata } from "@/lib/invitations/responses";
import { isInvitationE2EFixturesEnabled, submitFixtureInvitationRsvp } from "@/lib/invitations/e2e-fixtures";

function queryFrom(request: NextRequest) {
  const search = request.nextUrl.searchParams;
  return {
    status: search.get("status") ?? undefined,
    search: search.get("search") ?? undefined,
    sort: search.get("sort") ?? undefined,
    page: search.get("page") ?? undefined,
    perPage: search.get("perPage") ?? undefined,
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: { eventId: string } },
) {
  const access = await requireInvitationAccess(request, params.eventId);
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const dashboard = await getInvitationResponsesDashboard(params.eventId, queryFrom(request));
    if (!dashboard) return NextResponse.json({ error: "Invitation not found" }, { status: 404 });
    return NextResponse.json(dashboard, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("[invitations/responses] list failed", { eventId: params.eventId, error });
    return NextResponse.json({ error: "Responses could not be loaded" }, { status: 500 });
  }
}

const STATUS_BY_CODE: Readonly<Record<RsvpErrorCode, number>> = {
  event_unavailable: 404,
  rsvp_closed: 409,
  capacity_reached: 409,
  submission_limit_reached: 409,
  duplicate_contact: 409,
  contact_conflict: 409,
  invalid_edit_token: 404,
  rate_limited: 429,
};

export async function PATCH(
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
    return NextResponse.json({ errors: { form: "Send valid response details" } }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ errors: { form: "Send valid response details" } }, { status: 400 });
  }
  const values = body as Record<string, unknown>;
  if (typeof values.rsvpId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(values.rsvpId)) {
    return NextResponse.json({ errors: { rsvpId: "Choose a valid response" } }, { status: 400 });
  }
  const parsed = parseRsvpInput(values.response);
  if (!parsed.ok) return NextResponse.json({ errors: parsed.errors }, { status: 400 });

  try {
    const result = await (isInvitationE2EFixturesEnabled() ? submitFixtureInvitationRsvp : submitInvitationRsvp)({
      eventId: params.eventId,
      rsvpId: values.rsvpId,
      credentialMode: "administrative",
      input: parsed.value,
    });
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: result.code }, { status: STATUS_BY_CODE[result.code] });
    }

    // Deliberately omit guest names, contact values, notes, message, and tokens.
    // Administrative edits do not dispatch owner notifications.
    console.info("[invitations/responses] administrative RSVP updated", administrativeRsvpAuditMetadata({
      eventId: params.eventId,
      rsvpId: values.rsvpId,
      actor: access.kind,
      ownerId: access.kind === "owner" ? access.ownerId : undefined,
      attending: parsed.value.attending,
      partySize: parsed.value.partySize,
      updatedAt: new Date().toISOString(),
    }));
    return NextResponse.json({
      ok: true,
      summary: {
        attendingPeople: result.value.attendingTotal,
        declinedParties: result.value.declinedPartyTotal,
        remainingCapacity: result.value.remainingCapacity,
      },
    });
  } catch (error) {
    console.error("[invitations/responses] administrative update failed", {
      eventId: params.eventId,
      rsvpId: values.rsvpId,
      actor: access.kind,
      error,
    });
    return NextResponse.json({ ok: false, code: "event_unavailable" }, { status: 500 });
  }
}
