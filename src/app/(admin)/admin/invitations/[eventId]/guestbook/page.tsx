import { notFound } from "next/navigation";
import { GuestbookManager } from "@/components/invitations/GuestbookManager";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getInvitationEventForManagement, listInvitationCommentsForManagement, markInvitationGuestbookReviewed } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function FounderGuestbookPage({ params }: { params: { eventId: string } }) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();
  const comments = await listInvitationCommentsForManagement(event.id);
  await markInvitationGuestbookReviewed(event.id);
  return <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}><GuestbookManager eventId={event.id} title={event.honoreeNames || event.title} initialEnabled={event.commentWallEnabled} initialComments={comments} backHref={`/admin/invitations/${event.id}`} /></InvitationPublicProvider>;
}
