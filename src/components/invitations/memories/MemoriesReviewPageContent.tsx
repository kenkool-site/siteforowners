import { notFound } from "next/navigation";
import { getEventMemoriesSettings, listMediaForHostReview } from "@/lib/invitations/memories/repository";
import { OwnerMemoriesReviewQueue } from "./OwnerMemoriesReviewQueue";

export async function MemoriesReviewPageContent({ eventId, backHref }: { eventId: string; backHref: string }) {
  const settings = await getEventMemoriesSettings(eventId);
  if (!settings) notFound();
  const [live, flagged, removed, pending] = await Promise.all([
    listMediaForHostReview(eventId, "live"),
    listMediaForHostReview(eventId, "flagged"),
    listMediaForHostReview(eventId, "removed"),
    listMediaForHostReview(eventId, "pending"),
  ]);
  return <OwnerMemoriesReviewQueue eventId={eventId} mode={settings.memoriesMode} initialLive={live} initialFlagged={flagged} initialRemoved={removed} initialPending={pending} initialPublished={live} initialRejected={removed} mediaBasePath={`/api/invitations/events/${eventId}/memories/media`} backHref={backHref} />;
}
