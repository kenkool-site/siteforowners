import "server-only";

import { hashPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInvitationOwnerAndEvent as createInvitationOwnerAndEventWithDependencies,
  generateInvitationPin,
  generateInvitationSlug,
  getInvitationEventForManagement as getInvitationEventForManagementWithRepository,
  buildInvitationEventUpdateRow,
  buildInvitationOwnerUpdateRow,
  updateInvitationOwnerCredentials as updateInvitationOwnerCredentialsWithRepository,
  listFounderEvents as listFounderEventsWithRepository,
  type CreateInvitationOwnerAndEventInput,
  type InvitationFounderListRow,
  type InvitationManagementRow,
  type InvitationProvisionRows,
  type InvitationProvisionDependencies,
  type InvitationRepository,
} from "./repository-core";
import type { InvitationEventUpdate, InvitationOwnerCredentialUpdate } from "./validation";
import type { InvitationEventStatus } from "./types";

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

export type InvitationManagementRepository = {
  listByOwner(ownerId: string): Promise<InvitationManagementRow[]>;
  updateEvent(eventId: string, row: Record<string, string | number | boolean | null>): Promise<void>;
  updateStatus(eventId: string, status: InvitationEventStatus): Promise<void>;
  updateOwner(ownerId: string, row: Record<string, string | number | boolean | null>): Promise<void>;
};

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

export const invitationRepository: InvitationRepository & InvitationManagementRepository = {
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

  async listByOwner(ownerId: string) {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_events")
      .select(MANAGEMENT_SELECT)
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Unable to list owner invitations", { cause: error });
    return (data ?? []) as unknown as InvitationManagementRow[];
  },

  async updateEvent(eventId, row) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("invitation_events").update(row).eq("id", eventId);
    if (error) throw new Error("Unable to update invitation", { cause: error });
  },

  async updateStatus(eventId, status) {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("invitation_events")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw new Error("Unable to change invitation status", { cause: error });
  },

  async updateOwner(ownerId, row) {
    const supabase = createAdminClient();
    const { error } = await supabase.from("invitation_owners").update(row).eq("id", ownerId);
    if (error) throw new Error("Unable to update invitation owner", { cause: error });
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

export async function listOwnerInvitationEvents(
  ownerId: string,
  repository: InvitationRepository & InvitationManagementRepository = invitationRepository,
) {
  const rows = await repository.listByOwner(ownerId);
  return Promise.all(rows.map((row) => getInvitationEventForManagementWithRepository(row.id, {
    ...repository,
    get: async () => row,
  })));
}

export async function updateInvitationEvent(
  eventId: string,
  update: InvitationEventUpdate,
  passcodeHash?: string,
  repository: InvitationManagementRepository = invitationRepository,
): Promise<void> {
  await repository.updateEvent(eventId, buildInvitationEventUpdateRow(update, passcodeHash));
}

export async function updateInvitationEventStatus(
  eventId: string,
  status: InvitationEventStatus,
  repository: InvitationManagementRepository = invitationRepository,
): Promise<void> {
  await repository.updateStatus(eventId, status);
}

export async function updateInvitationOwnerCredentials(
  ownerId: string,
  update: InvitationOwnerCredentialUpdate,
  pinHash?: string,
  repository: InvitationManagementRepository = invitationRepository,
): Promise<void> {
  await updateInvitationOwnerCredentialsWithRepository(ownerId, update, pinHash, repository);
}
