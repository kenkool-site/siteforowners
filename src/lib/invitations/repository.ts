import "server-only";

import { hashPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInvitationOwnerAndEvent as createInvitationOwnerAndEventWithDependencies,
  generateInvitationPin,
  generateInvitationSlug,
  getInvitationEventForManagement as getInvitationEventForManagementWithRepository,
  listFounderEvents as listFounderEventsWithRepository,
  type CreateInvitationOwnerAndEventInput,
  type InvitationFounderListRow,
  type InvitationManagementRow,
  type InvitationProvisionRows,
  type InvitationProvisionDependencies,
  type InvitationRepository,
} from "./repository-core";

export type {
  CreateInvitationOwnerAndEventInput,
  FounderInvitationEventSummary,
  InvitationEventForManagement,
  InvitationOwnerForManagement,
  InvitationProvisionDependencies,
  InvitationProvisionIds,
  InvitationProvisionRows,
  InvitationRepository,
} from "./repository-core";
export { generateInvitationPin, generateInvitationSlug } from "./repository-core";

type RpcProvisionRow = { owner_id: string; event_id: string };

function isRpcProvisionRow(value: unknown): value is RpcProvisionRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.owner_id === "string" && typeof row.event_id === "string";
}

const MANAGEMENT_SELECT = [
  "id", "owner_id", "slug", "event_type", "locale", "title", "honoree_names",
  "description", "starts_at", "ends_at", "timezone", "venue_name", "address",
  "map_url", "theme_key", "primary_color", "accent_color", "font_pair_key",
  "designed_invite_path", "cover_image_path", "video_path",
  "show_public_rsvp_count", "capacity", "rsvp_deadline", "submission_limit",
  "email_notification_limit", "sms_notification_limit", "owner_email_notifications",
  "owner_sms_notifications", "notification_email", "notification_phone",
  "guest_email_confirmations", "status", "expire_at", "created_at", "updated_at",
  "invitation_owners!inner(id,name,email,phone,is_active,created_at,updated_at)",
].join(",");

export const invitationRepository: InvitationRepository = {
  async insert(rows: InvitationProvisionRows) {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc("create_invitation_owner_and_event", {
      p_owner: rows.owner,
      p_event: rows.event,
    });
    if (error) throw new Error("Unable to provision invitation", { cause: error });
    const row = Array.isArray(data) ? data[0] : data;
    if (!isRpcProvisionRow(row)) throw new Error("Invitation provisioning returned no record");
    return { ownerId: row.owner_id, eventId: row.event_id };
  },

  async list() {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_events")
      .select(
        "id,slug,title,starts_at,status,invitation_owners!inner(name,email),invitation_rsvps(attending,party_size),invitation_notifications(status)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to list invitations", { cause: error });
    return (data ?? []) as unknown as InvitationFounderListRow[];
  },

  async get(eventId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_events")
      .select(MANAGEMENT_SELECT)
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error("Unable to load invitation", { cause: error });
    return data as unknown as InvitationManagementRow | null;
  },
};

export async function createInvitationOwnerAndEvent(
  input: CreateInvitationOwnerAndEventInput,
  dependencies?: InvitationProvisionDependencies,
) {
  return createInvitationOwnerAndEventWithDependencies(input, dependencies ?? {
    hashPin,
    generatePin: generateInvitationPin,
    generateSlug: generateInvitationSlug,
    insert: invitationRepository.insert,
  });
}

export async function listFounderEvents(repository = invitationRepository) {
  return listFounderEventsWithRepository(repository);
}

export async function getInvitationEventForManagement(
  eventId: string,
  repository = invitationRepository,
) {
  return getInvitationEventForManagementWithRepository(eventId, repository);
}
