import { notFound } from "next/navigation";
import { EventEditor } from "@/components/invitations/EventEditor";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getInvitationMediaForManagement } from "@/lib/invitations/media";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function FounderInvitationDetailPage({ params }: { params: { eventId: string } }) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();
  const media = await getInvitationMediaForManagement(event);

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <EventEditor event={event} mode="founder" media={media} />
    </InvitationPublicProvider>
  );
}
