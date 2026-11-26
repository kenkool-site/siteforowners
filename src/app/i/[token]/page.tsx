import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventSiteFonts } from "@/components/invitations/EventSiteFonts";
import { PersonalRsvp } from "@/components/invitations/guest-list/PersonalRsvp";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { eventIcsDataUrl, googleEventCalendarUrl } from "@/lib/invitations/calendar";
import { formatEventWhen, memoriesPath } from "@/lib/invitations/event-site";
import { guestFirstName, isGuestToken, personalInvitationLead } from "@/lib/invitations/guest-list";
import { getGuestByToken } from "@/lib/invitations/guest-list-store";
import { loadPersonalInvitation } from "@/lib/invitations/guest-list-service";
import { invitationPageMetadata } from "@/lib/invitations/public-access";
import { getPublicInvitationBySlug } from "@/lib/invitations/repository";
import { getEffectiveEventState } from "@/lib/invitations/state";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { token: string } }): Promise<Metadata> {
  try {
    if (!isGuestToken(params.token)) return invitationPageMetadata(null, null, { page: "rsvp" });
    const loaded = await getGuestByToken(params.token);
    if (!loaded?.event.privateGuestListEnabled) return invitationPageMetadata(null, null, { page: "rsvp" });
    const invitation = await getPublicInvitationBySlug(loaded.event.slug);
    const state = invitation ? getEffectiveEventState(invitation.event, new Date()) : null;
    return invitationPageMetadata(invitation, state, { page: "rsvp", token: params.token });
  } catch {
    return invitationPageMetadata(null, null, { page: "rsvp" });
  }
}

export default async function PersonalInvitationPage({ params }: { params: { token: string } }) {
  if (!isGuestToken(params.token)) notFound();
  const loaded = await loadPersonalInvitation(params.token);
  if (!loaded) notFound();
  const { guest, event, state } = loaded;
  const whenLabel = formatEventWhen(event.startsAt, event.timezone, event.locale);
  const calendar = event.startsAt ? {
    uid: `${event.id}-${guest.id}`,
    title: event.title || event.honoreeNames,
    startsAt: event.startsAt,
    endsAt: null,
    timezone: event.timezone,
    location: event.venueName ?? "",
    description: event.honoreeNames,
  } : null;

  return (
    <EventSiteFonts>
      <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
        <PersonalRsvp
          token={guest.token}
          firstName={guestFirstName(guest.fullName)}
          lead={personalInvitationLead(event)}
          whenLabel={whenLabel}
          venue={event.venueName}
          seatsAllowed={guest.seatsAllowed}
          initialAttending={guest.rsvpAttending}
          initialPartySize={guest.rsvpPartySize}
          closed={state !== "published"}
          googleCalendarUrl={calendar ? googleEventCalendarUrl(calendar) : null}
          icsHref={calendar ? eventIcsDataUrl(calendar) : null}
          memoriesHref={memoriesPath(event.slug)}
        />
      </InvitationPublicProvider>
    </EventSiteFonts>
  );
}
