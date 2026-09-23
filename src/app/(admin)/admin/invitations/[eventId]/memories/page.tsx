import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { MemoriesReviewPageContent } from "@/components/invitations/memories/MemoriesReviewPageContent";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";

export const dynamic = "force-dynamic";

export default async function FounderMemoriesPage({ params }: { params: { eventId: string } }) {
  const event = await getInvitationEventForManagement(params.eventId);
  if (!event) notFound();
  return <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}><MemoriesReviewPageContent eventId={event.id} backHref={`/admin/invitations/${event.id}`} /></InvitationPublicProvider>;
}
