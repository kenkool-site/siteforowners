import { randomInt } from "node:crypto";
import { defaultInvitationExpiry } from "./event-time";
import { normalizeInvitationEmail } from "./validation";
import type { InvitationEventUpdate, InvitationOwnerCredentialUpdate } from "./validation";
import type {
  InvitationEvent,
  InvitationEventStatus,
  InvitationLocale,
  InvitationOwner,
} from "./types";
import { normalizeInvitationDesignRecipe, type InvitationDesignRecipe } from "./design-recipe";
import { normalizeInvitationReferenceAnalysis } from "./reference-analysis";
import { normalizeInvitationTravelInfo, type InvitationTravelInfo } from "./travel";

export const INVITATION_SUBMISSION_LIMIT = 250;
export const INVITATION_EMAIL_NOTIFICATION_LIMIT = 250;
export const INVITATION_SMS_NOTIFICATION_LIMIT = 50;

export type CreateInvitationOwnerAndEventInput = {
  ownerName: string;
  ownerEmail: string;
  ownerPhone: string | null;
  title: string;
  eventType: string;
  locale: InvitationLocale;
  startsAt?: string | null;
  timezone?: string;
  publicSubdomain?: string | null;
};

export type InvitationProvisionRows = {
  owner: {
    name: string;
    email: string;
    phone: string | null;
    pin_hash: string;
  };
  event: {
    slug: string;
    public_subdomain?: string | null;
    event_type: string;
    locale: InvitationLocale;
    title: string;
    starts_at: string | null;
    expire_at: string | null;
    timezone: string;
    submission_limit: number;
    email_notification_limit: number;
    sms_notification_limit: number;
    notification_email: string;
  };
};

export type InvitationProvisionIds = { ownerId: string; eventId: string };

export type InvitationEventUpdateRow = Record<string, unknown>;

export type InvitationProvisionDependencies = {
  hashPin(pin: string): Promise<string>;
  generatePin(): string;
  generateSlug(title: string): string;
  insert(rows: InvitationProvisionRows): Promise<InvitationProvisionIds>;
};

export type InvitationFounderListRow = {
  id: string;
  slug: string;
  title: string;
  starts_at: string | null;
  status: InvitationEventStatus;
  invitation_owners: { name: string; email: string } | Array<{ name: string; email: string }>;
  invitation_rsvps: Array<{ attending: boolean; party_size: number }> | null;
  invitation_notifications: Array<{ status: string }> | null;
};

export type InvitationManagementRow = {
  id: string;
  owner_id: string;
  slug: string;
  public_subdomain?: string | null;
  event_type: string;
  locale: InvitationLocale;
  title: string;
  honoree_names: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  map_url: string | null;
  travel_info?: unknown;
  theme_key: string;
  primary_color: string;
  accent_color: string;
  font_pair_key: string;
  design_recipe?: unknown;
  reference_analysis?: unknown;
  designed_invite_path: string | null;
  cover_image_path: string | null;
  video_path: string | null;
  passcode_hash?: string | null;
  show_public_rsvp_count: boolean;
  capacity: number | null;
  rsvp_deadline: string | null;
  submission_limit: number;
  email_notification_limit: number;
  sms_notification_limit: number;
  owner_email_notifications: boolean;
  owner_sms_notifications: boolean;
  notification_email: string | null;
  notification_phone: string | null;
  guest_email_confirmations: boolean;
  status: InvitationEventStatus;
  expire_at: string | null;
  created_at: string;
  updated_at: string;
  invitation_owners:
    | InvitationManagementOwnerRow
    | InvitationManagementOwnerRow[];
};

export type InvitationManagementOwnerRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  pin_hash?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InvitationPublicRow = {
  id: string;
  slug: string;
  public_subdomain?: string | null;
  event_type: string;
  locale: InvitationLocale;
  title: string;
  honoree_names: string;
  description: string;
  starts_at: string | null;
  ends_at: string | null;
  timezone: string;
  venue_name: string | null;
  address: string | null;
  map_url: string | null;
  travel_info?: unknown;
  theme_key: string;
  primary_color: string;
  accent_color: string;
  font_pair_key: string;
  design_recipe?: unknown;
  designed_invite_path: string | null;
  cover_image_path: string | null;
  video_path: string | null;
  passcode_hash: string | null;
  show_public_rsvp_count: boolean;
  rsvp_deadline: string | null;
  status: InvitationEventStatus;
  expire_at: string | null;
  invitation_rsvps: Array<{ attending: boolean; party_size: number }> | null;
};

export type PublicInvitationEvent = {
  id: string;
  slug: string;
  publicSubdomain: string | null;
  eventType: string;
  locale: InvitationLocale;
  title: string;
  honoreeNames: string;
  description: string;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  venueName: string | null;
  address: string | null;
  mapUrl: string | null;
  travelInfo?: InvitationTravelInfo;
  themeKey: string;
  primaryColor: string;
  accentColor: string;
  fontPairKey: string;
  designRecipe: InvitationDesignRecipe | null;
  designedInvitePath: string | null;
  coverImagePath: string | null;
  videoPath: string | null;
  showPublicRsvpCount: boolean;
  rsvpDeadline: string | null;
  status: InvitationEventStatus;
  expireAt: string | null;
};

export type PublicInvitationLookup = {
  event: PublicInvitationEvent;
  passcodeHash: string | null;
  rsvpSummary: { attendingPeople: number; declinedParties: number };
};

export interface InvitationPublicRepository {
  findBySlug(slug: string): Promise<InvitationPublicRow | null>;
}

export interface InvitationRepository {
  insert(rows: InvitationProvisionRows): Promise<InvitationProvisionIds>;
  list(): Promise<InvitationFounderListRow[]>;
  get(eventId: string): Promise<InvitationManagementRow | null>;
}

export type FounderInvitationEventSummary = {
  id: string;
  slug: string;
  title: string;
  ownerName: string;
  ownerEmail: string;
  startsAt: string | null;
  status: InvitationEventStatus;
  attendingPeople: number;
  declinedParties: number;
  notificationWarningCount: number;
};

export type InvitationOwnerForManagement = Omit<InvitationOwner, "pinHash">;
export type InvitationEventForManagement = Omit<InvitationEvent, "passcodeHash"> & {
  owner: InvitationOwnerForManagement;
};

function firstRelation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

export function generateInvitationPin(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function generateInvitationSlug(title: string): string {
  const prefix = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/g, "") || "event";
  const suffix = Array.from({ length: 6 }, () => randomInt(36).toString(36)).join("");
  return `${prefix}-${suffix}`;
}

export async function createInvitationOwnerAndEvent(
  input: CreateInvitationOwnerAndEventInput,
  dependencies: InvitationProvisionDependencies,
): Promise<InvitationProvisionIds & { slug: string; pin: string }> {
  const pin = dependencies.generatePin();
  const slug = dependencies.generateSlug(input.title);
  const email = normalizeInvitationEmail(input.ownerEmail);
  const ids = await dependencies.insert({
    owner: {
      name: input.ownerName.trim(),
      email,
      phone: input.ownerPhone?.trim() || null,
      pin_hash: await dependencies.hashPin(pin),
    },
    event: {
      slug,
      public_subdomain: input.publicSubdomain ?? null,
      event_type: input.eventType.trim(),
      locale: input.locale,
      title: input.title.trim(),
      starts_at: input.startsAt ?? null,
      expire_at: input.startsAt ? defaultInvitationExpiry(input.startsAt, input.timezone?.trim() || "America/New_York") : null,
      timezone: input.timezone?.trim() || "America/New_York",
      submission_limit: INVITATION_SUBMISSION_LIMIT,
      email_notification_limit: INVITATION_EMAIL_NOTIFICATION_LIMIT,
      sms_notification_limit: INVITATION_SMS_NOTIFICATION_LIMIT,
      notification_email: email,
    },
  });
  return { ...ids, slug, pin };
}

export async function listFounderEvents(
  repository: InvitationRepository,
): Promise<FounderInvitationEventSummary[]> {
  const rows = await repository.list();
  return rows.map((row) => {
    const owner = firstRelation(row.invitation_owners);
    const rsvps = row.invitation_rsvps ?? [];
    const notifications = row.invitation_notifications ?? [];
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      ownerName: owner.name,
      ownerEmail: owner.email,
      startsAt: row.starts_at,
      status: row.status,
      attendingPeople: rsvps.reduce(
        (total, rsvp) => total + (rsvp.attending ? rsvp.party_size : 0),
        0,
      ),
      declinedParties: rsvps.filter((rsvp) => !rsvp.attending).length,
      notificationWarningCount: notifications.filter(
        (notification) => notification.status === "failed" || notification.status === "suppressed",
      ).length,
    };
  });
}

export async function getInvitationEventForManagement(
  eventId: string,
  repository: InvitationRepository,
): Promise<InvitationEventForManagement | null> {
  const row = await repository.get(eventId);
  if (!row) return null;
  const owner = firstRelation(row.invitation_owners);
  const normalizedRecipe = normalizeInvitationDesignRecipe(row.design_recipe);
  return {
    id: row.id,
    ownerId: row.owner_id,
    slug: row.slug,
    publicSubdomain: row.public_subdomain ?? null,
    eventType: row.event_type,
    locale: row.locale,
    title: row.title,
    honoreeNames: row.honoree_names,
    description: row.description,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    venueName: row.venue_name,
    address: row.address,
    mapUrl: row.map_url,
    travelInfo: normalizeInvitationTravelInfo(row.travel_info),
    themeKey: row.theme_key,
    primaryColor: row.primary_color,
    accentColor: row.accent_color,
    fontPairKey: row.font_pair_key,
    designRecipe: normalizedRecipe.ok ? normalizedRecipe.value : null,
    referenceAnalysis: normalizeInvitationReferenceAnalysis(row.reference_analysis),
    designedInvitePath: row.designed_invite_path,
    coverImagePath: row.cover_image_path,
    videoPath: row.video_path,
    showPublicRsvpCount: row.show_public_rsvp_count,
    capacity: row.capacity,
    rsvpDeadline: row.rsvp_deadline,
    submissionLimit: row.submission_limit,
    emailNotificationLimit: row.email_notification_limit,
    smsNotificationLimit: row.sms_notification_limit,
    ownerEmailNotifications: row.owner_email_notifications,
    ownerSmsNotifications: row.owner_sms_notifications,
    notificationEmail: row.notification_email,
    notificationPhone: row.notification_phone,
    guestEmailConfirmations: row.guest_email_confirmations,
    status: row.status,
    expireAt: row.expire_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    owner: {
      id: owner.id,
      name: owner.name,
      email: owner.email,
      phone: owner.phone,
      isActive: owner.is_active,
      createdAt: owner.created_at,
      updatedAt: owner.updated_at,
    },
  };
}

export async function getPublicInvitationBySlug(
  slug: string,
  repository: InvitationPublicRepository,
): Promise<PublicInvitationLookup | null> {
  const row = await repository.findBySlug(slug);
  if (!row) return null;
  const rsvps = row.invitation_rsvps ?? [];
  const normalizedRecipe = normalizeInvitationDesignRecipe(row.design_recipe);
  return {
    event: {
      id: row.id,
      slug: row.slug,
      publicSubdomain: row.public_subdomain ?? null,
      eventType: row.event_type,
      locale: row.locale,
      title: row.title,
      honoreeNames: row.honoree_names,
      description: row.description,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
      timezone: row.timezone,
      venueName: row.venue_name,
      address: row.address,
      mapUrl: row.map_url,
      travelInfo: normalizeInvitationTravelInfo(row.travel_info),
      themeKey: row.theme_key,
      primaryColor: row.primary_color,
      accentColor: row.accent_color,
      fontPairKey: row.font_pair_key,
      designRecipe: normalizedRecipe.ok ? normalizedRecipe.value : null,
      designedInvitePath: row.designed_invite_path,
      coverImagePath: row.cover_image_path,
      videoPath: row.video_path,
      showPublicRsvpCount: row.show_public_rsvp_count,
      rsvpDeadline: row.rsvp_deadline,
      status: row.status,
      expireAt: row.expire_at,
    },
    passcodeHash: row.passcode_hash,
    rsvpSummary: {
      attendingPeople: rsvps.reduce(
        (total, rsvp) => total + (rsvp.attending ? rsvp.party_size : 0),
        0,
      ),
      declinedParties: rsvps.filter((rsvp) => !rsvp.attending).length,
    },
  };
}

const EVENT_UPDATE_COLUMNS: Partial<Record<keyof InvitationEventUpdate, string>> = {
  publicSubdomain: "public_subdomain",
  eventType: "event_type",
  locale: "locale",
  title: "title",
  honoreeNames: "honoree_names",
  description: "description",
  startsAt: "starts_at",
  endsAt: "ends_at",
  timezone: "timezone",
  venueName: "venue_name",
  address: "address",
  mapUrl: "map_url",
  travelInfo: "travel_info",
  themeKey: "theme_key",
  primaryColor: "primary_color",
  accentColor: "accent_color",
  fontPairKey: "font_pair_key",
  designRecipe: "design_recipe",
  showPublicRsvpCount: "show_public_rsvp_count",
  capacity: "capacity",
  rsvpDeadline: "rsvp_deadline",
  submissionLimit: "submission_limit",
  emailNotificationLimit: "email_notification_limit",
  smsNotificationLimit: "sms_notification_limit",
  ownerEmailNotifications: "owner_email_notifications",
  ownerSmsNotifications: "owner_sms_notifications",
  notificationEmail: "notification_email",
  notificationPhone: "notification_phone",
  guestEmailConfirmations: "guest_email_confirmations",
  expireAt: "expire_at",
};

export function buildInvitationEventUpdateRow(
  update: InvitationEventUpdate,
  passcodeHash?: string,
): InvitationEventUpdateRow {
  const row: InvitationEventUpdateRow = { updated_at: new Date().toISOString() };
  for (const [key, column] of Object.entries(EVENT_UPDATE_COLUMNS)) {
    const field = key as keyof InvitationEventUpdate;
    const fieldValue = update[field];
    if (column && fieldValue !== undefined) row[column] = fieldValue;
  }
  if (update.removePasscode) row.passcode_hash = null;
  else if (update.passcode !== undefined && passcodeHash !== undefined) row.passcode_hash = passcodeHash;
  return row;
}

export function buildInvitationOwnerUpdateRow(
  update: InvitationOwnerCredentialUpdate,
  pinHash?: string,
): InvitationEventUpdateRow {
  const row: InvitationEventUpdateRow = { updated_at: new Date().toISOString() };
  if (update.ownerName !== undefined) row.name = update.ownerName;
  if (update.ownerEmail !== undefined) row.email = update.ownerEmail;
  if (update.ownerPhone !== undefined) row.phone = update.ownerPhone;
  if (update.newOwnerPin !== undefined && pinHash !== undefined) row.pin_hash = pinHash;
  return row;
}

export async function updateInvitationOwnerCredentials(
  ownerId: string,
  update: InvitationOwnerCredentialUpdate,
  pinHash: string | undefined,
  repository: { updateOwner(ownerId: string, row: InvitationEventUpdateRow): Promise<void> },
): Promise<void> {
  const row = buildInvitationOwnerUpdateRow(update, pinHash);
  await repository.updateOwner(ownerId, row);
}
