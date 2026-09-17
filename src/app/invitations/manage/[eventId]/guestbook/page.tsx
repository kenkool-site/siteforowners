import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { GuestbookManager } from "@/components/invitations/GuestbookManager";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { getInvitationEventForManagement, listInvitationCommentsForManagement, markInvitationGuestbookReviewed } from "@/lib/invitations/repository";

export const revalidate = 0;

export default async function OwnerGuestbookPage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try { ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null; } catch { ownerId = null; }
  if (!ownerId) redirect("/invitations/login");
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event || !await invitationOwnerOwnsEvent(ownerId, params.eventId)) notFound();
  const comments = await listInvitationCommentsForManagement(event.id);
  await markInvitationGuestbookReviewed(event.id);
  return <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}><GuestbookManager eventId={event.id} title={event.honoreeNames || event.title} initialEnabled={event.commentWallEnabled} initialComments={comments} backHref={`/invitations/manage/${event.id}`} /></InvitationPublicProvider>;
}
