import { notFound } from "next/navigation";
import { getEventMemoriesSettings, getHostHighlightsOverview, listMediaForHostReview, listMemoryMoments } from "@/lib/invitations/memories/repository";
import { OwnerMemoriesReviewQueue } from "./OwnerMemoriesReviewQueue";
import { OwnerMomentsManager } from "./OwnerMomentsManager";
import { OwnerHighlightsManager } from "./OwnerHighlightsManager";

export async function MemoriesReviewPageContent({ eventId, backHref }: { eventId: string; backHref: string }) {
  const settings = await getEventMemoriesSettings(eventId);
  if (!settings) notFound();
  const [live, flagged, removed, pending, moments, highlights] = await Promise.all([
    listMediaForHostReview(eventId, "live"),
    listMediaForHostReview(eventId, "flagged"),
    listMediaForHostReview(eventId, "removed"),
    listMediaForHostReview(eventId, "pending"),
    listMemoryMoments(eventId),
    getHostHighlightsOverview(eventId),
  ]);
  return (
    <>
      <OwnerMemoriesReviewQueue eventId={eventId} mode={settings.memoriesMode} initialLive={live} initialFlagged={flagged} initialRemoved={removed} initialPending={pending} initialPublished={live} initialRejected={removed} mediaBasePath={`/api/invitations/events/${eventId}/memories/media`} backHref={backHref} />
      <div className="bg-[#F7F4F8] px-4 pb-6 sm:px-6 sm:pb-10">
        <div className="mx-auto max-w-6xl">
          <OwnerMomentsManager eventId={eventId} initialMoments={moments} />
          {highlights && (
            <OwnerHighlightsManager
              eventId={eventId}
              initialMode={highlights.mode}
              initialGenerationStatus={highlights.generationStatus}
              initialLastGeneratedMediaCount={highlights.lastGeneratedMediaCount}
              initialGroups={highlights.groups}
            />
          )}
        </div>
      </div>
    </>
  );
}
