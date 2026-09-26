import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { OwnerGuestDashboard } from "@/components/invitations/OwnerGuestDashboard";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { INVITATION_OWNER_SESSION_COOKIE, verifyOwnerSession } from "@/lib/invitations/auth";
import { getInvitationEventForManagement, getInvitationGuestbookSummary, getInvitationResponsesDashboard } from "@/lib/invitations/repository";
import { invitationOwnerOwnsEvent } from "@/lib/invitations/access";
import { getEventMemoriesSettings, getMemoriesEventSummary } from "@/lib/invitations/memories/repository";

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
  let initialData;
  let guestbook;
  let memories;
  try {
    initialData = await getInvitationResponsesDashboard(event.id, {});
  } catch (error) {
    console.error("[invitations] owner dashboard responses failed", { eventId: event.id, error });
  }
  try {
    const [settings, summary] = await Promise.all([getEventMemoriesSettings(event.id), getMemoriesEventSummary(event.id)]);
    if (settings) memories = { enabled: settings.memoriesEnabled, mode: settings.memoriesMode, findMeEnabled: settings.findMeEnabled, ...summary };
  } catch (error) {
    console.error("[invitations] owner dashboard Memories failed", { eventId: event.id, error });
  }
  try {
    guestbook = await getInvitationGuestbookSummary(event.id, event.commentWallEnabled, event.commentWallReviewedAt);
  } catch (error) {
    console.error("[invitations] owner dashboard guestbook failed", { eventId: event.id, error });
  }

  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <OwnerGuestDashboard event={event} initialData={initialData ?? undefined} guestbook={guestbook} memories={memories} />
    </InvitationPublicProvider>
  );
}
