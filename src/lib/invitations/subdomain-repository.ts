import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { InvitationSubdomainRepository, PlatformSubdomainReservation } from "./subdomains";

export const invitationSubdomainRepository: InvitationSubdomainRepository = {
  async findReservation(label: string): Promise<PlatformSubdomainReservation | null> {
    const { data, error } = await createAdminClient()
      .from("platform_subdomains")
      .select("tenant_id,invitation_event_id")
      .eq("label", label)
      .maybeSingle();
    if (error) throw new Error("Unable to check public address", { cause: error });
    if (!data) return null;
    return {
      tenantId: data.tenant_id as string | null,
      invitationEventId: data.invitation_event_id as string | null,
    };
  },
};
