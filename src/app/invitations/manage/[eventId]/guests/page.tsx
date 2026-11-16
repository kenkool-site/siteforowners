import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EventSiteFonts } from "@/components/invitations/EventSiteFonts";
import { HostGuestListApp } from "@/components/invitations/guest-list/HostGuestListApp";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { formatEventDay } from "@/lib/invitations/event-site";
import { GuestListError } from "@/lib/invitations/guest-list-store";
import { loadHostGuestList } from "@/lib/invitations/guest-list-service";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

export default async function HostGuestListPage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try {
    ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null;
  } catch {
    ownerId = null;
  }
  if (!ownerId) redirect("/invitations/login");
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event || !await invitationOwnerOwnsEvent(ownerId, params.eventId)) notFound();
  if (!event.privateGuestListEnabled) notFound();

  let list;
  try {
    list = await loadHostGuestList(event.id);
  } catch (error) {
    if (error instanceof GuestListError && error.code === "feature_disabled") notFound();
    throw error;
  }

  const when = formatEventDay(event.startsAt, event.timezone, event.locale);
  const place = event.venueName;
  const eventWhen = [when, place].filter(Boolean).join(" · ");

  return (
    <EventSiteFonts>
      <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
        <HostGuestListApp
          eventId={event.id}
          eventName={event.honoreeNames || event.title}
          eventWhen={eventWhen}
          initialGuests={list.guests}
          smsConfigured={list.smsConfigured}
          smsMessage={list.smsMessage}
          backHref={`/invitations/manage/${event.id}`}
        />
      </InvitationPublicProvider>
    </EventSiteFonts>
  );
}
