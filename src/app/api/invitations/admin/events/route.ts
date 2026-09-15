import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/invitations/auth";
import { hasFounderInvitationSession } from "@/lib/invitations/founder-access";
import { createInvitationOwnerAndEvent } from "@/lib/invitations/repository";
import { normalizeInvitationEmail, normalizeInvitationPhone } from "@/lib/invitations/validation";
import type { InvitationLocale } from "@/lib/invitations/types";
import { validatePlatformSubdomain } from "@/lib/subdomain";
import { isPlatformSubdomainTakenError } from "@/lib/invitations/subdomains";

type FounderEventInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  title: string;
  eventType: string;
  locale: InvitationLocale;
  startsAt: string;
  timezone: string;
  publicSubdomain: string | null;
};

function hasFounderSession(request: NextRequest): boolean {
  return hasFounderInvitationSession(
    process.env.ADMIN_PASSWORD,
    request.cookies.get("admin_session")?.value,
  );
}

function isTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

function parseFounderEventInput(value: unknown): FounderEventInput | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const ownerName = typeof body.ownerName === "string" ? body.ownerName.trim() : "";
  const ownerEmail = typeof body.ownerEmail === "string"
    ? normalizeInvitationEmail(body.ownerEmail)
    : "";
  const rawPhone = typeof body.ownerPhone === "string" ? body.ownerPhone.trim() : "";
  const ownerPhone = rawPhone ? normalizeInvitationPhone(rawPhone) : null;
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const eventType = typeof body.eventType === "string" ? body.eventType.trim() : "";
  const locale = body.locale === "en" || body.locale === "es" ? body.locale : null;
  const startsAt = typeof body.startsAt === "string" ? body.startsAt : "";
  const timezone = typeof body.timezone === "string" ? body.timezone.trim() : "";
  const rawSubdomain = typeof body.publicSubdomain === "string" ? body.publicSubdomain : "";
  const subdomain = rawSubdomain ? validatePlatformSubdomain(rawSubdomain) : null;

  if (
    !ownerName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail) ||
    (rawPhone && !ownerPhone) ||
    !title ||
    !eventType ||
    !locale ||
    !startsAt ||
    Number.isNaN(Date.parse(startsAt)) ||
    !timezone ||
    !isTimezone(timezone) || (subdomain !== null && !subdomain.ok)
  ) {
    return null;
  }

  return {
    ownerName, ownerEmail, ownerPhone, title, eventType, locale, startsAt, timezone,
    publicSubdomain: subdomain?.ok ? subdomain.value : null,
  };
}

export async function POST(request: NextRequest) {
  if (!hasFounderSession(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const input = parseFounderEventInput(body);
  if (!input) {
    return NextResponse.json({ error: "Check the required event and owner details" }, { status: 400 });
  }

  try {
    const result = await createInvitationOwnerAndEvent(input);
    return NextResponse.json({
      eventId: result.eventId,
      slug: result.slug,
      pin: result.pin,
      publicSubdomain: input.publicSubdomain,
    });
  } catch (error) {
    if (isPlatformSubdomainTakenError(error)) {
      return NextResponse.json({ errors: { publicSubdomain: "already_in_use" } }, { status: 409 });
    }
    console.error("[invitations/admin/events] provisioning failed", { error });
    return NextResponse.json({ error: "Unable to create invitation" }, { status: 500 });
  }
}
