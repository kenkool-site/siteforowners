import { notFound } from "next/navigation";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { getInvitationEventForManagement } from "@/lib/invitations/repository";
import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { getHostHonorState } from "@/lib/invitations/memories/honor-service";
import type { HostHonorState } from "@/lib/invitations/memories/guests-of-honor";
import { GuestsOfHonorFlow } from "./GuestsOfHonorFlow";

export async function GuestsOfHonorPage({ eventId, backHref }: { eventId: string; backHref: string }) {
  const event = await getInvitationEventForManagement(eventId);
  if (!event) notFound();
  const settings = await getEventMemoriesSettings(eventId);
  let initial: HostHonorState | null = null;
  try {
    initial = await getHostHonorState(eventId);
  } catch (error) {
    console.error("[guests-of-honor] could not load host state", { eventId, error });
  }
  return (
    <InvitationPublicProvider locale={event.locale} timeZone={event.timezone}>
      <GuestsOfHonorFlow
        eventId={event.id}
        eventTitle={event.honoreeNames.trim() || event.title}
        eventType={event.eventType}
        backHref={backHref}
        brandingOn={settings?.brandingEnabled !== false}
        reviewRequired={settings?.memoriesMode === "review_required"}
        initial={initial}
      />
    </InvitationPublicProvider>
  );
}
