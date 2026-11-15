import {
  inviteSmsBody,
  outboundEstimate,
  smsSegmentCount,
  toGuestListItem,
  type GuestListItem,
  type GuestRecord,
} from "./guest-list";

const EVENT = {
  slug: "mercy-john",
  publicSubdomain: "mercy-john",
  honoreeNames: "Mercy & John",
  title: "Mercy & John",
  eventType: "wedding",
  locale: "en" as const,
  startsAt: "2026-12-19T19:00:00.000Z",
  timezone: "America/Chicago",
  venueName: "The Bliss at Aubrey",
};

function record(input: Partial<GuestRecord> & Pick<GuestRecord, "id" | "fullName" | "phoneE164" | "seatsAllowed">): GuestRecord {
  return {
    eventId: "preview-event",
    email: null,
    household: null,
    token: "K7mQ2pLx9aWc4nRb",
    deliveryStatus: "not_sent",
    sentAt: null,
    openedAt: null,
    optedOutAt: null,
    rsvpAttending: null,
    rsvpPartySize: null,
    rsvpId: null,
    reminderSentAt: null,
    failureReason: null,
    createdAt: "2026-11-01T15:00:00.000Z",
    updatedAt: "2026-11-01T15:00:00.000Z",
    ...input,
  };
}

const named: GuestRecord[] = [
  record({ id: "chanelle", fullName: "Chanelle Wyche-Afolabi", phoneE164: "+12145550192", seatsAllowed: 2, household: "Wyche-Afolabi", deliveryStatus: "delivered", openedAt: "2026-11-02T15:00:00.000Z", rsvpAttending: true, rsvpPartySize: 2 }),
  record({ id: "grace", fullName: "Grace Egwuatu", phoneE164: "+14695550144", seatsAllowed: 2, deliveryStatus: "delivered", openedAt: "2026-11-02T16:00:00.000Z" }),
  record({ id: "oluyemisi", fullName: "Oluyemisi Makinde Adebo", phoneE164: "+19725550171", seatsAllowed: 2, deliveryStatus: "sent", sentAt: "2026-11-02T12:00:00.000Z" }),
  record({ id: "temi", fullName: "Temiloluwa Makinde", phoneE164: "+12145550108", seatsAllowed: 3, household: "Makinde" }),
  record({ id: "psalmy", fullName: "Psalmy", phoneE164: "+18175550160", seatsAllowed: 1, deliveryStatus: "delivered", openedAt: "2026-11-03T12:00:00.000Z", rsvpAttending: false, rsvpPartySize: 1 }),
  record({ id: "amos", fullName: "Amos Gbeminiyi", phoneE164: "+12145550133", seatsAllowed: 2, deliveryStatus: "failed", failureReason: "undeliverable" }),
  record({ id: "abimbola", fullName: "Abimbola", phoneE164: "+14695550188", seatsAllowed: 2, deliveryStatus: "delivered", openedAt: "2026-11-03T18:00:00.000Z", rsvpAttending: true, rsvpPartySize: 2 }),
];

function filler(id: string, status: GuestRecord["deliveryStatus"], seats: number, party: number | null, attending: boolean | null, opened: boolean): GuestRecord {
  return record({
    id,
    fullName: `Sample Guest ${id}`,
    phoneE164: `+1214555${id.padStart(4, "0").slice(-4)}`,
    seatsAllowed: seats,
    deliveryStatus: status,
    sentAt: status === "not_sent" ? null : "2026-11-02T12:00:00.000Z",
    openedAt: opened ? "2026-11-04T12:00:00.000Z" : null,
    rsvpAttending: attending,
    rsvpPartySize: party,
  });
}

const extras: GuestRecord[] = [
  filler("0101", "not_sent", 2, null, null, false),
  filler("0102", "not_sent", 1, null, null, false),
  filler("0103", "sent", 2, null, null, false),
  filler("0104", "sent", 2, null, null, false),
  filler("0105", "sent", 2, null, null, false),
  filler("0106", "delivered", 2, null, null, true),
  filler("0107", "delivered", 1, null, null, true),
  filler("0108", "delivered", 1, null, null, true),
  filler("0109", "delivered", 1, null, null, true),
  filler("0110", "delivered", 2, 2, true, true),
  filler("0111", "delivered", 2, 2, true, true),
  filler("0112", "delivered", 2, 2, true, true),
  filler("0113", "delivered", 2, 2, true, true),
  filler("0114", "delivered", 2, 2, true, true),
  filler("0115", "delivered", 2, 2, true, true),
  filler("0116", "delivered", 1, 1, true, true),
  filler("0117", "delivered", 1, 1, false, true),
];

export const previewGuests: GuestListItem[] = [...named, ...extras].map(toGuestListItem);

export const previewInviteBody = inviteSmsBody({
  ...EVENT,
  guestName: "Chanelle Wyche-Afolabi",
  url: "https://mercy-john.invitespot.app/i/K7mQ2pLx9aWc4nRb",
});

export const previewInviteEstimate = outboundEstimate([previewInviteBody, previewInviteBody, previewInviteBody]);

export const previewSegment = smsSegmentCount(previewInviteBody);

export const PREVIEW_EVENT_NAME = "Mercy & John";
export const PREVIEW_WHEN = "Saturday, December 19, 2026 · The Bliss at Aubrey";
export const PREVIEW_COVER = "/invitespot/photos/wedding-couple.webp";
