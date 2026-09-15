import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeInvitationReferenceAnalysis, type InvitationReferenceAnalysis } from "./reference-analysis";

export async function reserveInvitationAnalysisAttempt(eventId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("reserve_invitation_analysis_attempt", { p_event_id: eventId });
  if (error) throw new Error("Unable to reserve invitation analysis", { cause: error });
  return data === true;
}

export async function saveInvitationReferenceAnalysis(eventId: string, analysis: InvitationReferenceAnalysis): Promise<void> {
  const { error } = await createAdminClient().from("invitation_events").update({ reference_analysis: analysis, updated_at: new Date().toISOString() }).eq("id", eventId);
  if (error) throw new Error("Unable to save invitation analysis", { cause: error });
}

export async function getInvitationReferenceAnalysis(eventId: string): Promise<InvitationReferenceAnalysis | null> {
  const { data, error } = await createAdminClient().from("invitation_events").select("reference_analysis").eq("id", eventId).maybeSingle();
  if (error) throw new Error("Unable to load invitation analysis", { cause: error });
  return normalizeInvitationReferenceAnalysis(data?.reference_analysis);
}
