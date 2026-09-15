import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { EventEditor } from "@/components/invitations/EventEditor";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { getInvitationMediaForManagement } from "@/lib/invitations/media";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";

export const revalidate = 0;

export default async function OwnerInvitationManagementPage({ params }: { params: { eventId: string } }) {
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
  const media = await getInvitationMediaForManagement(event);

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <EventEditor event={event} mode="owner" media={media} />
    </InvitationPublicProvider>
  );
}
