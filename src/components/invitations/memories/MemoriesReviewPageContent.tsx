import { notFound } from "next/navigation";
import { getEventMemoriesSettings, getEventSchedule, getHostHighlightsOverview, listMediaForHostReview, listMemoryMoments } from "@/lib/invitations/memories/repository";
import { HonorManageLink } from "./GuestsOfHonorFlow";
import { OwnerMemoriesReviewQueue } from "./OwnerMemoriesReviewQueue";
import { OwnerMomentsManager } from "./OwnerMomentsManager";
import { OwnerHighlightsManager } from "./OwnerHighlightsManager";

export async function MemoriesReviewPageContent({ eventId, backHref }: { eventId: string; backHref: string }) {
  const settings = await getEventMemoriesSettings(eventId);
  if (!settings) notFound();
  const [live, flagged, removed, pending, moments, highlights, eventSchedule] = await Promise.all([
    listMediaForHostReview(eventId, "live"),
    listMediaForHostReview(eventId, "flagged"),
    listMediaForHostReview(eventId, "removed"),
    listMediaForHostReview(eventId, "pending"),
    listMemoryMoments(eventId),
    getHostHighlightsOverview(eventId),
    getEventSchedule(eventId),
  ]);
  return (
    <>
      <div className="bg-[#F7F4F8] px-4 pt-4 sm:px-6">
        <div className="mx-auto flex max-w-6xl justify-end">
          <HonorManageLink href={`${backHref}/memories/guests-of-honor`} />
        </div>
      </div>
      <OwnerMemoriesReviewQueue eventId={eventId} mode={settings.memoriesMode} initialLive={live} initialFlagged={flagged} initialRemoved={removed} initialPending={pending} initialPublished={live} initialRejected={removed} mediaBasePath={`/api/invitations/events/${eventId}/memories/media`} backHref={backHref} />
      <div className="bg-[#F7F4F8] px-4 pb-6 sm:px-6 sm:pb-10">
        <div className="mx-auto max-w-6xl">
          <OwnerMomentsManager eventId={eventId} initialMoments={moments} initialEventSchedule={eventSchedule} />
          {highlights && (
            <OwnerHighlightsManager
              eventId={eventId}
              initialMode={highlights.mode}
              initialGenerationStatus={highlights.generationStatus}
              initialLastGeneratedMediaCount={highlights.lastGeneratedMediaCount}
              initialGenerationError={highlights.generationError}
              initialGroups={highlights.groups}
            />
          )}
        </div>
      </div>
    </>
  );
}
