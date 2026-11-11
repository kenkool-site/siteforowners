import { GuestsOfHonorPage } from "@/components/invitations/memories/GuestsOfHonorPage";

export const dynamic = "force-dynamic";

export default async function FounderGuestsOfHonorPage({ params }: { params: { eventId: string } }) {
  return <GuestsOfHonorPage eventId={params.eventId} backHref={`/admin/invitations/${params.eventId}/memories`} />;
}
