import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuestMessageComposer } from "@/components/invitations/GuestMessageComposer";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { eligibleBroadcastRecipients, listInvitationBroadcasts } from "@/lib/invitations/broadcasts";
import { getInvitationEventForManagement, listInvitationResponseRows } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function OwnerMessagePage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try { ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null; } catch { ownerId = null; }
  if (!ownerId) redirect("/invitations/login");
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event || !await invitationOwnerOwnsEvent(ownerId, params.eventId)) notFound();

  const [rows, history] = await Promise.all([
    listInvitationResponseRows(event.id),
    listInvitationBroadcasts(event.id),
  ]);

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <GuestMessageComposer
        eventId={event.id}
        eventName={event.honoreeNames || event.title}
        backHref={`/invitations/manage/${event.id}`}
        initialRecipientCounts={{
          email: eligibleBroadcastRecipients(rows, "email").length,
          sms: eligibleBroadcastRecipients(rows, "sms").length,
        }}
        initialTotalResponses={rows.length}
        initialHistory={history}
      />
    </InvitationPublicProvider>
  );
}
