import "server-only";

import { hashPin } from "@/lib/admin-auth";
import { isInvitationE2EFixturesEnabled } from "./e2e-guard";
import { createEditToken, hashEditToken } from "./auth";
import type { InvitationMediaSnapshot } from "./media";
import { dispatchRsvpNotifications, type DispatchInvitationRsvpNotificationsInput } from "./notifications";
import type {
  InvitationFounderListRow,
  InvitationManagementRow,
  InvitationProvisionRows,
  InvitationPublicRow,
} from "./repository-core";
import type {
  InvitationNotificationWarningRow,
  InvitationResponseRow,
  InvitationResponsesEventRow,
} from "./responses";
import { submitRsvp, type SubmitRsvpRequest, type SubmitRsvpResult } from "./rsvp";
import type { InvitationNotificationChannel, InvitationNotificationStatus } from "./types";

type FixtureOwner = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  pin: string;
  pinHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

type FixtureRsvp = InvitationResponseRow & { editTokenHash: string };

type FixtureNotification = InvitationNotificationWarningRow & {
  eventId: string;
  rsvpId: string;
};

type FixtureProviderCall = { channel: InvitationNotificationChannel; eventId: string };

type FixtureStore = {
  owners: FixtureOwner[];
  events: InvitationManagementRow[];
  rsvps: FixtureRsvp[];
  notifications: FixtureNotification[];
  providerCalls: FixtureProviderCall[];
  nextId: number;
};

export { isInvitationE2EFixturesEnabled } from "./e2e-guard";

export type InvitationE2EManifest = {
  owners: {
    primary: { email: string; pin: string };
    secondary: { email: string; pin: string };
  };
  events: Record<
    "english" | "spanish" | "deadline" | "expired" | "offline" | "secondary" | "suppressed",
    { id: string; slug: string; title: string }
  >;
};

declare global {
  // eslint-disable-next-line no-var
  var __invitationE2EFixtureStore: FixtureStore | undefined;
}

const FIXTURE_MEDIA = "/marketing/demo/portfolio/nails-2.jpeg";
const FIXTURE_VIDEO = "/marketing/demo/demo-reel.mp4";
const CREATED_AT = "2026-09-14T12:00:00.000Z";

function requireStore(): FixtureStore {
  if (!isInvitationE2EFixturesEnabled()) throw new Error("Invitation E2E fixtures are disabled");
  if (!globalThis.__invitationE2EFixtureStore) throw new Error("Invitation E2E fixtures are not seeded");
  return globalThis.__invitationE2EFixtureStore;
}

function uuid(value: number): string {
  return `00000000-0000-4000-8000-${value.toString().padStart(12, "0")}`;
}

function ownerRow(owner: FixtureOwner) {
  return {
    id: owner.id,
    name: owner.name,
    email: owner.email,
    phone: owner.phone,
    pin_hash: owner.pinHash,
    is_active: owner.isActive,
    created_at: owner.createdAt,
    updated_at: owner.updatedAt,
  };
}

function eventRow(input: {
  id: string;
  owner: FixtureOwner;
  slug: string;
  title: string;
  locale?: "en" | "es";
  status?: InvitationManagementRow["status"];
  passcodeHash?: string | null;
  deadline?: string | null;
  expireAt?: string | null;
  emailLimit?: number;
}): InvitationManagementRow {
  return {
    id: input.id,
    owner_id: input.owner.id,
    slug: input.slug,
    event_type: input.locale === "es" ? "boda" : "celebration",
    locale: input.locale ?? "en",
    title: input.title,
    honoree_names: input.locale === "es" ? "Ana y Luis" : "Ana and Luis",
    description: input.locale === "es" ? "Celebre con nosotros." : "Celebrate with us.",
    starts_at: "2099-06-15T22:00:00.000Z",
    ends_at: "2099-06-16T02:00:00.000Z",
    timezone: "America/New_York",
    venue_name: "Pilot Hall",
    address: "1 Test Plaza, Brooklyn, NY",
    map_url: "https://maps.google.com/?q=Pilot+Hall",
    theme_key: input.locale === "es" ? "romantic" : "classic",
    primary_color: "#2B2231",
    accent_color: "#B86B77",
    font_pair_key: "fraunces-geist",
    designed_invite_path: FIXTURE_MEDIA,
    cover_image_path: null,
    video_path: FIXTURE_VIDEO,
    passcode_hash: input.passcodeHash ?? null,
    show_public_rsvp_count: true,
    capacity: 8,
    rsvp_deadline: input.deadline ?? null,
    submission_limit: 250,
    email_notification_limit: input.emailLimit ?? 250,
    sms_notification_limit: 50,
    owner_email_notifications: true,
    owner_sms_notifications: false,
    notification_email: input.owner.email,
    notification_phone: input.owner.phone,
    guest_email_confirmations: false,
    status: input.status ?? "published",
    expire_at: input.expireAt ?? null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    invitation_owners: ownerRow(input.owner),
  };
}

function manifest(store: FixtureStore): InvitationE2EManifest {
  const bySlug = (slug: string) => {
    const event = store.events.find((candidate) => candidate.slug === slug);
    if (!event) throw new Error(`Missing fixture event: ${slug}`);
    return { id: event.id, slug: event.slug, title: event.title };
  };
  return {
    owners: {
      primary: { email: store.owners[0]!.email, pin: store.owners[0]!.pin },
      secondary: { email: store.owners[1]!.email, pin: store.owners[1]!.pin },
    },
    events: {
      english: bySlug("english-celebration"),
      spanish: bySlug("celebracion-privada"),
      deadline: bySlug("deadline-closed"),
      expired: bySlug("expired-private-event"),
      offline: bySlug("offline-private-event"),
      secondary: bySlug("secondary-owner-event"),
      suppressed: bySlug("notification-suppressed"),
    },
  };
}

export async function resetInvitationE2EFixtures(): Promise<InvitationE2EManifest> {
  if (!isInvitationE2EFixturesEnabled()) throw new Error("Invitation E2E fixtures are disabled");
  const [primaryPinHash, secondaryPinHash, passcodeHash] = await Promise.all([
    hashPin("111111"),
    hashPin("222222"),
    hashPin("2468"),
  ]);
  const primary: FixtureOwner = {
    id: uuid(1), name: "Primary Owner", email: "owner@example.com", phone: "+12125550101",
    pin: "111111", pinHash: primaryPinHash, isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  };
  const secondary: FixtureOwner = {
    id: uuid(2), name: "Secondary Owner", email: "secondary@example.com", phone: "+12125550102",
    pin: "222222", pinHash: secondaryPinHash, isActive: true, createdAt: CREATED_AT, updatedAt: CREATED_AT,
  };
  const store: FixtureStore = {
    owners: [primary, secondary],
    events: [
      eventRow({ id: uuid(11), owner: primary, slug: "english-celebration", title: "English Celebration" }),
      eventRow({ id: uuid(12), owner: primary, slug: "celebracion-privada", title: "Celebración privada", locale: "es", passcodeHash }),
      eventRow({ id: uuid(13), owner: primary, slug: "deadline-closed", title: "Deadline Secret", deadline: "2020-01-01T00:00:00.000Z" }),
      eventRow({ id: uuid(14), owner: primary, slug: "expired-private-event", title: "Private expired title", status: "expired" }),
      eventRow({ id: uuid(15), owner: primary, slug: "offline-private-event", title: "Private offline title", status: "offline" }),
      eventRow({ id: uuid(16), owner: secondary, slug: "secondary-owner-event", title: "Secondary Owner Event" }),
      eventRow({ id: uuid(17), owner: primary, slug: "notification-suppressed", title: "Suppressed Notification", emailLimit: 1 }),
    ],
    rsvps: [],
    notifications: [{ id: uuid(900), eventId: uuid(17), rsvpId: uuid(901), channel: "email", status: "sent" }],
    providerCalls: [],
    nextId: 100,
  };
  globalThis.__invitationE2EFixtureStore = store;
  return manifest(store);
}

export const invitationE2ERepository = {
  async insert(rows: InvitationProvisionRows) {
    const store = requireStore();
    const value = store.nextId++;
    const owner: FixtureOwner = {
      id: uuid(value),
      name: rows.owner.name,
      email: rows.owner.email,
      phone: rows.owner.phone,
      pin: "",
      pinHash: rows.owner.pin_hash,
      isActive: true,
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
    };
    store.owners.push(owner);
    store.events.unshift(eventRow({
      id: uuid(value),
      owner,
      slug: rows.event.slug,
      title: rows.event.title,
      locale: rows.event.locale,
      status: "draft",
    }));
    const event = store.events[0]!;
    event.event_type = rows.event.event_type;
    event.starts_at = rows.event.starts_at;
    event.timezone = rows.event.timezone;
    event.submission_limit = rows.event.submission_limit;
    event.email_notification_limit = rows.event.email_notification_limit;
    event.sms_notification_limit = rows.event.sms_notification_limit;
    event.notification_email = rows.event.notification_email;
    event.honoree_names = "";
    event.description = "";
    event.venue_name = null;
    event.address = null;
    event.map_url = null;
    event.designed_invite_path = null;
    event.video_path = null;
    return { ownerId: owner.id, eventId: event.id };
  },
  async list(): Promise<InvitationFounderListRow[]> {
    const store = requireStore();
    return store.events.map((event) => ({
      id: event.id,
      slug: event.slug,
      title: event.title,
      starts_at: event.starts_at,
      status: event.status,
      invitation_owners: event.invitation_owners,
      invitation_rsvps: store.rsvps.filter((row) => row.event_id === event.id).map((row) => ({ attending: row.attending, party_size: row.party_size })),
      invitation_notifications: store.notifications.filter((row) => row.eventId === event.id).map((row) => ({ status: row.status })),
    }));
  },
  async get(eventId: string): Promise<InvitationManagementRow | null> {
    return requireStore().events.find((event) => event.id === eventId) ?? null;
  },
  async findBySlug(slug: string): Promise<InvitationPublicRow | null> {
    const store = requireStore();
    const event = store.events.find((candidate) => candidate.slug === slug);
    if (!event) return null;
    return {
      ...event,
      passcode_hash: event.passcode_hash ?? null,
      invitation_rsvps: store.rsvps.filter((row) => row.event_id === event.id).map((row) => ({ attending: row.attending, party_size: row.party_size })),
    };
  },
  async listByOwner(ownerId: string): Promise<InvitationManagementRow[]> {
    return requireStore().events.filter((event) => event.owner_id === ownerId);
  },
  async updateEvent(eventId: string, row: Record<string, string | number | boolean | null>): Promise<void> {
    const event = requireStore().events.find((candidate) => candidate.id === eventId);
    if (!event) throw new Error("Fixture event not found");
    Object.assign(event, row);
  },
  async updateStatus(eventId: string, status: InvitationManagementRow["status"]): Promise<void> {
    const event = requireStore().events.find((candidate) => candidate.id === eventId);
    if (!event) throw new Error("Fixture event not found");
    event.status = status;
    event.updated_at = new Date().toISOString();
  },
  async updateOwner(ownerId: string, row: Record<string, string | number | boolean | null>): Promise<void> {
    const store = requireStore();
    const owner = store.owners.find((candidate) => candidate.id === ownerId);
    if (!owner) throw new Error("Fixture owner not found");
    if (typeof row.name === "string") owner.name = row.name;
    if (typeof row.email === "string") owner.email = row.email;
    if (row.phone === null || typeof row.phone === "string") owner.phone = row.phone;
    if (typeof row.pin_hash === "string") owner.pinHash = row.pin_hash;
    owner.updatedAt = new Date().toISOString();
    for (const event of store.events.filter((candidate) => candidate.owner_id === ownerId)) {
      event.invitation_owners = ownerRow(owner);
    }
  },
  async getResponsesEvent(eventId: string): Promise<InvitationResponsesEventRow | null> {
    const event = requireStore().events.find((candidate) => candidate.id === eventId);
    return event ? {
      status: event.status,
      capacity: event.capacity,
      rsvp_deadline: event.rsvp_deadline,
      expire_at: event.expire_at,
      email_notification_limit: event.email_notification_limit,
      sms_notification_limit: event.sms_notification_limit,
    } : null;
  },
  async listResponseRows(eventId: string): Promise<InvitationResponseRow[]> {
    return requireStore().rsvps.filter((row) => row.event_id === eventId);
  },
  async listResponseNotifications(eventId: string): Promise<InvitationNotificationWarningRow[]> {
    return requireStore().notifications.filter((row) => row.eventId === eventId);
  },
};

export function fixtureProvisionHelpers() {
  const store = requireStore();
  const value = store.nextId;
  return {
    generatePin: () => (310000 + value).toString(),
    generateSlug: (title: string) => `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-e2e-${value.toString().padStart(4, "0")}`,
    insert: invitationE2ERepository.insert,
  };
}

export function findFixtureOwnerLogin(email: string): { id: string; pinHash: string } | null {
  const owner = requireStore().owners.find((candidate) => candidate.isActive && candidate.email === email);
  return owner ? { id: owner.id, pinHash: owner.pinHash } : null;
}

export function fixtureOwnerOwnsEvent(ownerId: string, eventId: string): boolean {
  return requireStore().events.some((event) => event.id === eventId && event.owner_id === ownerId);
}

export function attachFixtureInvitationMedia(eventId: string): void {
  const event = requireStore().events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error("Fixture event not found");
  event.designed_invite_path = FIXTURE_MEDIA;
  event.video_path = FIXTURE_VIDEO;
}

export function getFixtureInvitationMedia(eventId: string): InvitationMediaSnapshot {
  const event = requireStore().events.find((candidate) => candidate.id === eventId);
  if (!event) throw new Error("Fixture event not found");
  return {
    designedInvite: event.designed_invite_path ? { kind: "designed_invite", path: event.designed_invite_path, url: event.designed_invite_path } : null,
    cover: null,
    video: event.video_path ? { kind: "video", path: event.video_path, url: event.video_path } : null,
    gallery: event.designed_invite_path ? [
      { id: uuid(700), kind: "gallery", path: "/marketing/demo/portfolio/haircuts-2.png", url: "/marketing/demo/portfolio/haircuts-2.png", altText: "Guests celebrating", sortOrder: 0 },
    ] : [],
  };
}

export async function submitFixtureInvitationRsvp(request: SubmitRsvpRequest): Promise<SubmitRsvpResult> {
  return submitRsvp(request, {
    createToken: createEditToken,
    hashToken: hashEditToken,
    mutate: async ({ eventId, existingRsvpId, editTokenHash, administrative, input }) => {
      const store = requireStore();
      const event = store.events.find((candidate) => candidate.id === eventId);
      if (!event) return { data: null, error: { message: "INVITE_EVENT_UNAVAILABLE" } };
      const existing = existingRsvpId ? store.rsvps.find((candidate) => candidate.id === existingRsvpId && candidate.event_id === eventId) : null;
      if (existingRsvpId && (!existing || (!administrative && existing.editTokenHash !== editTokenHash))) {
        return { data: null, error: { message: "INVITE_INVALID_EDIT_TOKEN" } };
      }
      if (!existing && store.rsvps.length >= event.submission_limit) {
        return { data: null, error: { message: "INVITE_SUBMISSION_LIMIT_REACHED" } };
      }
      if (!existing && store.rsvps.some((candidate) => candidate.event_id === eventId && ((input.email && candidate.email === input.email) || (input.phone && candidate.phone === input.phone)))) {
        return { data: null, error: { message: "INVITE_DUPLICATE_CONTACT" } };
      }
      const before = existing?.attending ? existing.party_size : 0;
      const attendingTotal = store.rsvps
        .filter((candidate) => candidate.event_id === eventId && candidate.id !== existing?.id)
        .reduce((total, candidate) => total + (candidate.attending ? candidate.party_size : 0), 0)
        + (input.attending ? input.partySize : 0);
      if (event.capacity !== null && attendingTotal > event.capacity && (input.attending ? input.partySize : 0) > before) {
        return { data: null, error: { message: "INVITE_CAPACITY_REACHED" } };
      }
      const now = new Date().toISOString();
      const id = existing?.id ?? uuid(store.nextId++);
      const row: FixtureRsvp = {
        id,
        event_id: eventId,
        primary_name: input.primaryName,
        email: input.email,
        phone: input.phone,
        attending: input.attending,
        party_size: input.partySize,
        additional_guest_names: input.additionalGuestNames,
        dietary_or_accessibility_notes: input.dietaryOrAccessibilityNotes,
        message: input.message,
        editTokenHash: existing?.editTokenHash ?? editTokenHash,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      if (existing) Object.assign(existing, row);
      else store.rsvps.push(row);
      const eventRows = store.rsvps.filter((candidate) => candidate.event_id === eventId);
      return {
        data: [{
          rsvp_id: id,
          mutation_kind: existing ? "updated" : "created",
          attending_total: attendingTotal,
          declined_party_total: eventRows.filter((candidate) => !candidate.attending).length,
          remaining_capacity: event.capacity === null ? null : Math.max(0, event.capacity - attendingTotal),
        }],
        error: null,
      };
    },
  });
}

export async function dispatchFixtureInvitationRsvpNotifications(
  input: DispatchInvitationRsvpNotificationsInput,
): Promise<{ notificationsDelayed: boolean }> {
  const store = requireStore();
  const event = store.events.find((candidate) => candidate.id === input.eventId);
  if (!event) return { notificationsDelayed: true };
  const result = await dispatchRsvpNotifications({
    event: {
      id: event.id,
      slug: event.slug,
      title: event.title,
      locale: event.locale,
      ownerEmailNotifications: event.owner_email_notifications,
      ownerSmsNotifications: event.owner_sms_notifications,
      notificationEmail: event.notification_email,
      notificationPhone: event.notification_phone,
      guestEmailConfirmations: event.guest_email_confirmations,
    },
    rsvp: input.mutation.rsvp,
    created: input.mutation.created,
    editUrl: input.editUrl,
    dashboardUrl: `${input.origin}/invitations/manage/${event.id}`,
    inviteUrl: `${input.origin}/invite/${event.slug}`,
  }, {
    reserve: async (channel, notification) => {
      const used = store.notifications.filter((row) => row.eventId === event.id && row.channel === channel && row.status !== "suppressed").length;
      const limit = channel === "email" ? event.email_notification_limit : event.sms_notification_limit;
      const id = uuid(store.nextId++);
      store.notifications.push({ id, eventId: event.id, rsvpId: notification.rsvpId, channel, status: used >= limit ? "suppressed" : "pending" });
      return used >= limit ? { id, allowed: false as const } : { id, allowed: true as const };
    },
    markSent: async (notificationId) => {
      const notification = store.notifications.find((row) => row.id === notificationId);
      if (notification) notification.status = "sent";
    },
    markFailed: async (notificationId) => {
      const notification = store.notifications.find((row) => row.id === notificationId);
      if (notification) notification.status = "failed";
    },
    email: { send: async () => {
      store.providerCalls.push({ channel: "email", eventId: event.id });
      return { ok: true as const, providerId: `fixture-email-${store.providerCalls.length}` };
    } },
    sms: { send: async () => {
      store.providerCalls.push({ channel: "sms", eventId: event.id });
      return { ok: true as const, providerId: `fixture-sms-${store.providerCalls.length}` };
    } },
  });
  return { notificationsDelayed: result.notificationsDelayed };
}

export function invitationE2EFixtureSnapshot(): {
  rsvps: Array<{ eventId: string; primaryName: string; attending: boolean; partySize: number }>;
  notifications: Array<{ eventId: string; channel: InvitationNotificationChannel; status: InvitationNotificationStatus }>;
  providerCalls: FixtureProviderCall[];
} {
  const store = requireStore();
  return {
    rsvps: store.rsvps.map((row) => ({ eventId: row.event_id, primaryName: row.primary_name, attending: row.attending, partySize: row.party_size })),
    notifications: store.notifications.map((row) => ({ eventId: row.eventId, channel: row.channel, status: row.status })),
    providerCalls: [...store.providerCalls],
  };
}
