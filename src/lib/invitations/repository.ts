import "server-only";

import { hashPin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInvitationOwnerAndEvent as createInvitationOwnerAndEventWithDependencies,
  generateInvitationPin,
  generateInvitationSlug,
  getInvitationEventForManagement as getInvitationEventForManagementWithRepository,
  getPublicInvitationBySlug as getPublicInvitationBySlugWithRepository,
  buildInvitationEventUpdateRow,
  updateInvitationOwnerCredentials as updateInvitationOwnerCredentialsWithRepository,
  listFounderEvents as listFounderEventsWithRepository,
  type CreateInvitationOwnerAndEventInput,
  type InvitationFounderListRow,
  type InvitationEventUpdateRow,
  type InvitationManagementRow,
  type InvitationProvisionRows,
  type InvitationProvisionDependencies,
  type InvitationPublicRepository,
  type InvitationRepository,
} from "./repository-core";
import type { InvitationEventUpdate, InvitationOwnerCredentialUpdate } from "./validation";
import type { InvitationEventStatus } from "./types";
import {
  buildInvitationResponsesDashboard,
  type InvitationNotificationWarningRow,
  type InvitationResponseQuery,
  type InvitationResponseRow,
  type InvitationResponsesDashboard,
  type InvitationResponsesEventRow,
} from "./responses";
import {
  fixtureProvisionHelpers,
  invitationE2ERepository,
  isInvitationE2EFixturesEnabled,
} from "./e2e-fixtures";

export type {
  CreateInvitationOwnerAndEventInput,
  FounderInvitationEventSummary,
  InvitationEventForManagement,
  InvitationOwnerForManagement,
  InvitationProvisionDependencies,
  InvitationProvisionIds,
  InvitationProvisionRows,
  PublicInvitationEvent,
  PublicInvitationLookup,
  InvitationRepository,
} from "./repository-core";
export { generateInvitationPin, generateInvitationSlug } from "./repository-core";

export type InvitationManagementRepository = {
  listByOwner(ownerId: string): Promise<InvitationManagementRow[]>;
  updateEvent(eventId: string, row: InvitationEventUpdateRow): Promise<void>;
  updateStatus(eventId: string, status: InvitationEventStatus): Promise<void>;
  updateOwner(ownerId: string, row: Record<string, string | number | boolean | null>): Promise<void>;
};

export type InvitationResponsesRepository = {
  getResponsesEvent(eventId: string): Promise<InvitationResponsesEventRow | null>;
  listResponseRows(eventId: string): Promise<InvitationResponseRow[]>;
  listResponseNotifications(eventId: string): Promise<InvitationNotificationWarningRow[]>;
};

type RpcProvisionRow = { owner_id: string; event_id: string };

function isRpcProvisionRow(value: unknown): value is RpcProvisionRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.owner_id === "string" && typeof row.event_id === "string";
}

const MANAGEMENT_SELECT = [
  "id", "owner_id", "slug", "public_subdomain", "event_type", "locale", "title", "honoree_names",
  "description", "starts_at", "ends_at", "timezone", "venue_name", "address",
  "map_url", "travel_info", "theme_key", "primary_color", "accent_color", "font_pair_key",
  "design_recipe", "reference_analysis",
  "designed_invite_path", "cover_image_path", "video_path",
  "show_public_rsvp_count", "capacity", "rsvp_deadline", "submission_limit",
  "email_notification_limit", "sms_notification_limit", "owner_email_notifications",
  "owner_sms_notifications", "notification_email", "notification_phone",
  "guest_email_confirmations", "status", "expire_at", "created_at", "updated_at",
  "invitation_owners!inner(id,name,email,phone,is_active,created_at,updated_at)",
].join(",");

const PUBLIC_SELECT = [
  "id", "slug", "public_subdomain", "event_type", "locale", "title", "honoree_names", "description",
  "starts_at", "ends_at", "timezone", "venue_name", "address", "map_url", "travel_info",
  "theme_key", "primary_color", "accent_color", "font_pair_key",
  "design_recipe",
  "designed_invite_path", "cover_image_path", "video_path", "passcode_hash",
  "show_public_rsvp_count", "rsvp_deadline", "status", "expire_at",
  "invitation_owners!inner(is_active)", "invitation_rsvps(attending,party_size)",
].join(",");

export const invitationRepository: InvitationRepository & InvitationManagementRepository & InvitationPublicRepository & InvitationResponsesRepository = {
  async insert(rows: InvitationProvisionRows) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.insert(rows);
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
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.list();
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
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.get(eventId);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_events")
      .select(MANAGEMENT_SELECT)
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error("Unable to load invitation", { cause: error });
    return data as unknown as InvitationManagementRow | null;
  },

  async findBySlug(slug: string) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.findBySlug(slug);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_events")
      .select(PUBLIC_SELECT)
      .eq("slug", slug)
      .eq("invitation_owners.is_active", true)
      .maybeSingle();
    if (error) throw new Error("Unable to load public invitation", { cause: error });
    return data as unknown as import("./repository-core").InvitationPublicRow | null;
  },

  async listByOwner(ownerId: string) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.listByOwner(ownerId);
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
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.updateEvent(eventId, row);
    const supabase = createAdminClient();
    const { error } = await supabase.from("invitation_events").update(row).eq("id", eventId);
    if (error?.message.includes("INVITE_CAPACITY_BELOW_ATTENDANCE")) throw new Error("INVITE_CAPACITY_BELOW_ATTENDANCE");
    if (error) throw new Error("Unable to update invitation", { cause: error });
  },

  async updateStatus(eventId, status) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.updateStatus(eventId, status);
    const supabase = createAdminClient();
    const { error } = await supabase
      .from("invitation_events")
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", eventId);
    if (error) throw new Error("Unable to change invitation status", { cause: error });
  },

  async updateOwner(ownerId, row) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.updateOwner(ownerId, row);
    const supabase = createAdminClient();
    const { error } = await supabase.from("invitation_owners").update(row).eq("id", ownerId);
    if (error) throw new Error("Unable to update invitation owner", { cause: error });
  },

  async getResponsesEvent(eventId) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.getResponsesEvent(eventId);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_events")
      .select("status,capacity,rsvp_deadline,expire_at,email_notification_limit,sms_notification_limit")
      .eq("id", eventId)
      .maybeSingle();
    if (error) throw new Error("Unable to load response totals", { cause: error });
    return data as InvitationResponsesEventRow | null;
  },

  async listResponseRows(eventId) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.listResponseRows(eventId);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_rsvps")
      .select("id,event_id,primary_name,email,phone,attending,party_size,additional_guest_names,dietary_or_accessibility_notes,message,created_at,updated_at")
      .eq("event_id", eventId);
    if (error) throw new Error("Unable to load invitation responses", { cause: error });
    return (data ?? []) as InvitationResponseRow[];
  },

  async listResponseNotifications(eventId) {
    if (isInvitationE2EFixturesEnabled()) return invitationE2ERepository.listResponseNotifications(eventId);
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("invitation_notifications")
      .select("id,channel,status")
      .eq("event_id", eventId);
    if (error) throw new Error("Unable to load response notifications", { cause: error });
    return (data ?? []) as InvitationNotificationWarningRow[];
  },
};

export async function createInvitationOwnerAndEvent(
  input: CreateInvitationOwnerAndEventInput,
  dependencies?: InvitationProvisionDependencies,
) {
  const fixtureHelpers = isInvitationE2EFixturesEnabled() ? fixtureProvisionHelpers() : null;
  return createInvitationOwnerAndEventWithDependencies(input, dependencies ?? {
    hashPin,
    generatePin: fixtureHelpers?.generatePin ?? generateInvitationPin,
    generateSlug: fixtureHelpers?.generateSlug ?? generateInvitationSlug,
    insert: fixtureHelpers?.insert ?? invitationRepository.insert,
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

export async function getPublicInvitationBySlug(
  slug: string,
  repository: InvitationPublicRepository = invitationRepository,
) {
  return getPublicInvitationBySlugWithRepository(slug, repository);
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

export async function getInvitationResponsesDashboard(
  eventId: string,
  query: Partial<Record<keyof InvitationResponseQuery, string | number>>,
  repository: InvitationResponsesRepository = invitationRepository,
  now = new Date(),
): Promise<InvitationResponsesDashboard | null> {
  const [event, rows, notifications] = await Promise.all([
    repository.getResponsesEvent(eventId),
    repository.listResponseRows(eventId),
    repository.listResponseNotifications(eventId),
  ]);
  if (!event) return null;
  return buildInvitationResponsesDashboard({ event, rows, notifications, query, now });
}

export async function listInvitationResponseRows(
  eventId: string,
  repository: InvitationResponsesRepository = invitationRepository,
): Promise<InvitationResponseRow[]> {
  return repository.listResponseRows(eventId);
}
