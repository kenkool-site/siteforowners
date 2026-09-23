import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { MemoriesReviewPageContent } from "@/components/invitations/memories/MemoriesReviewPageContent";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

export default async function OwnerMemoriesPage({ params }: { params: { eventId: string } }) {
  const signed = cookies().get(INVITATION_OWNER_SESSION_COOKIE)?.value;
  let ownerId: string | null = null;
  try { ownerId = signed ? verifyOwnerSession(signed)?.ownerId ?? null : null; } catch { ownerId = null; }
  if (!ownerId) redirect("/invitations/login");
  if (!await invitationOwnerOwnsEvent(ownerId, params.eventId)) notFound();
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();
  return <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}><MemoriesReviewPageContent eventId={event.id} backHref={`/invitations/manage/${event.id}`} /></InvitationPublicProvider>;
}
