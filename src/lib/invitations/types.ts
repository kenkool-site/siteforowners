export type InvitationEventStatus =
  | "draft"
  | "published"
  | "rsvp_closed"
  | "expired"
  | "offline";

export type EffectiveEventState = InvitationEventStatus;

export type InvitationLocale = "en" | "es";
export type InvitationMediaKind = "gallery_image";
export type InvitationNotificationAudience = "owner" | "guest";
export type InvitationNotificationChannel = "email" | "sms";
export type InvitationNotificationKind =
  | "rsvp_created"
  | "rsvp_updated"
  | "guest_confirmation";
export type InvitationNotificationStatus =
  | "pending"
  | "sent"
  | "failed"
  | "suppressed";

export interface InvitationOwner {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  pinHash: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationEvent {
  id: string;
  ownerId: string;
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
  venueUrl: string | null;
  address: string | null;
  mapUrl: string | null;
  travelInfo?: InvitationTravelInfo;
  styleGuide?: InvitationStyleGuide | null;
  additionalSections?: InvitationAdditionalSection[];
  themeKey: string;
  primaryColor: string;
  accentColor: string;
  fontPairKey: string;
  designRecipe: InvitationDesignRecipe | null;
  referenceAnalysis: InvitationReferenceAnalysis | null;
  designedInvitePath: string | null;
  coverImagePath: string | null;
  videoPath: string | null;
  passcodeHash: string | null;
  showPublicRsvpCount: boolean;
  commentWallEnabled: boolean;
  commentWallReviewedAt: string | null;
  capacity: number | null;
  rsvpDeadline: string | null;
  submissionLimit: number;
  emailNotificationLimit: number;
  smsNotificationLimit: number;
  ownerEmailNotifications: boolean;
  ownerSmsNotifications: boolean;
  notificationEmail: string | null;
  notificationPhone: string | null;
  guestEmailConfirmations: boolean;
  status: InvitationEventStatus;
  expireAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationMedia {
  id: string;
  eventId: string;
  kind: InvitationMediaKind;
  storagePath: string;
  altText: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationRsvp {
  id: string;
  eventId: string;
  primaryName: string;
  email: string | null;
  phone: string | null;
  attending: boolean;
  partySize: number;
  additionalGuestNames: string[];
  dietaryOrAccessibilityNotes: string | null;
  message: string | null;
  editTokenHash: string;
  lastNotifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvitationNotification {
  id: string;
  eventId: string;
  rsvpId: string;
  audience: InvitationNotificationAudience;
  channel: InvitationNotificationChannel;
  recipient: string;
  kind: InvitationNotificationKind;
  status: InvitationNotificationStatus;
  providerMessageId: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RsvpInput {
  primaryName: string;
  email?: string | null;
  phone?: string | null;
  attending: boolean;
  partySize?: number;
  additionalGuestNames?: string[];
  dietaryOrAccessibilityNotes?: string | null;
  message?: string | null;
}

export interface RsvpSummary {
  attendingPeople: number;
  attendingParties: number;
  declinedParties: number;
  remainingCapacity: number | null;
  totalSubmissions: number;
}

export interface RsvpMutationResult {
  rsvp: Omit<
    InvitationRsvp,
    "editTokenHash" | "lastNotifiedAt" | "createdAt" | "updatedAt"
  >;
  rsvpId: string;
  created: boolean;
  outcome: "created" | "updated" | "unchanged";
  attendingTotal: number;
  declinedPartyTotal: number;
  remainingCapacity: number | null;
  editToken: string | null;
}
import type { InvitationDesignRecipe } from "./design-recipe";
import type { InvitationReferenceAnalysis } from "./reference-analysis";
import type { InvitationTravelInfo } from "./travel";
import type { InvitationStyleGuide } from "./style-guide";
import type { InvitationAdditionalSection } from "./additional-sections";
