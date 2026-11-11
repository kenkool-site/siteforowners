import { getEventMemoriesSettings } from "@/lib/invitations/memories/repository";
import { getPublicHonorView } from "@/lib/invitations/memories/honor-service";
import type { PublicHonorView } from "@/lib/invitations/memories/guests-of-honor";

export async function getGuestHonorResponse(eventId: string): Promise<{ status: number; body: { honor: PublicHonorView | null; error?: string } }> {
  const settings = await getEventMemoriesSettings(eventId);
  if (!settings || !settings.memoriesEnabled) {
    return { status: 404, body: { honor: null, error: "memories not enabled for this event" } };
  }
  try {
    return { status: 200, body: { honor: await getPublicHonorView(eventId) } };
  } catch (error) {
    console.error("[memories/guests-of-honor] public read failed", { eventId, error });
    return { status: 200, body: { honor: null } };
  }
}
