import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { EventSiteFonts } from "@/components/invitations/EventSiteFonts";
import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import { PublicInvitation, type PublicInvitationEvent } from "@/components/invitations/PublicInvitation";
import type { InvitationMediaSnapshot } from "@/lib/invitations/media";
import type { InvitationCommentPage } from "@/lib/invitations/comments";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Event site preview",
  robots: { index: false, follow: false },
};

const event: PublicInvitationEvent = {
  id: "preview-event",
  slug: "sample-celebration",
  eventType: "wedding",
  locale: "en",
  title: "Mercy & John",
  honoreeNames: "Mercy & John",
  description: "You are warmly invited to celebrate the wedding of Mercy & John. Please join us for this special occasion on December 19th, 2026 at 1:00 PM in Dallas, Texas. We look forward to sharing this joyful day with you and creating wonderful memories together.",
  startsAt: "2026-12-19T19:00:00.000Z",
  endsAt: "2026-12-20T01:00:00.000Z",
  rsvpDeadline: "2026-10-02T05:00:00.000Z",
  timezone: "America/Chicago",
  venueName: "The Bliss at Aubrey",
  venueUrl: "https://www.theblissataubrey.com/",
  address: "4381 US-377, Aubrey, TX 76227",
  mapUrl: null,
  travelInfo: {
    airports: [
      { name: "Dallas Fort Worth International", note: "DFW", directionsUrl: null },
      { name: "Dallas Love Field", note: "DAL", directionsUrl: null },
    ],
    hotels: [
      { name: "Lone Star Lodge & Marina", address: "2200 FM 1192, Pilot Point, TX 76258", recommended: true },
      { name: "Hilton Garden Inn Denton", address: "3110 Colorado Blvd, Denton, TX 76210", recommended: false },
      { name: "Residence Inn by Marriott Denton", address: "3761 I-35E, Denton, TX 76210", recommended: false },
      { name: "Homewood Suites by Hilton Denton", address: "2907 Shoreline Dr, Denton, TX 76210", recommended: false },
    ],
  },
  styleGuide: {
    note: "Glamorous fascinators, matching outfit colors.",
    colors: [
      { name: "Sage", color: "#97A68B" },
      { name: "Ivory", color: "#F5F0E0" },
      { name: "Petal", color: "#E1BEBC" },
    ],
  },
  additionalSections: [],
  eventSchedule: [
    { name: "Wedding Ceremony", startsAt: "2026-12-19T19:00:00.000Z", locationName: "The Bliss at Aubrey", locationAddress: "4381 US-377, Aubrey, TX 76227" },
    { name: "Cocktail", startsAt: "2026-12-19T20:30:00.000Z" },
    { name: "Wedding Reception", startsAt: "2026-12-19T21:30:00.000Z" },
  ],
  themeKey: "classic",
  primaryColor: "#1A3D24",
  accentColor: "#B3945C",
  fontPairKey: "fraunces-geist",
  designRecipe: null,
  showPublicRsvpCount: true,
  commentWallEnabled: true,
};

const media: InvitationMediaSnapshot = {
  designedInvite: null,
  cover: { kind: "cover", path: "preview/cover.svg", url: "/event-site-preview/cover.svg" },
  video: null,
  gallery: [
    { id: "a", kind: "gallery", path: "preview/a.svg", url: "/event-site-preview/photo-a.svg", altText: "Celebration portrait", sortOrder: 0 },
    { id: "b", kind: "gallery", path: "preview/b.svg", url: "/event-site-preview/photo-b.svg", altText: "Hands and ring", sortOrder: 1 },
    { id: "c", kind: "gallery", path: "preview/c.svg", url: "/event-site-preview/photo-c.svg", altText: "Outdoors", sortOrder: 2 },
    { id: "d", kind: "gallery", path: "preview/d.svg", url: "/event-site-preview/photo-d.svg", altText: "Formal portrait", sortOrder: 3 },
  ],
};

const comments: InvitationCommentPage = {
  comments: [
    { id: "1", guestName: "Grace Egwuatu", body: "Congratulations to you sis, May the Lord who has started a good thing with you, be with you and your husband to be in Jesus name. Amen.", createdAt: "2026-10-05T15:00:00.000Z" },
    { id: "2", guestName: "Oluyemisi Makinde Adebo", body: "Hearty congratulations my darling brother. The Lord will perfect all that concerns the union.", createdAt: "2026-10-04T15:00:00.000Z" },
    { id: "3", guestName: "Temi", body: "Congratulations once again. We can’t wait to celebrate you guys.", createdAt: "2026-09-19T15:00:00.000Z" },
  ],
  nextCursor: null,
};

export default function EventSitePreviewPage({ searchParams }: { searchParams: { phase?: string; rsvp?: string } }) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const thanks = searchParams.phase === "thanks";
  const closed = searchParams.rsvp === "closed";
  const success = searchParams.rsvp === "success";
  return (
    <EventSiteFonts>
      <InvitationPublicProvider locale="en" timeZone="America/Chicago">
        <PublicInvitation
          event={event}
          state={closed ? "rsvp_closed" : "published"}
          initialMedia={media}
          rsvpSummary={{ attendingPeople: 164, declinedParties: 0 }}
          initialComments={comments}
          nowIso={thanks ? "2026-12-20T18:00:00.000Z" : "2026-11-15T15:41:00.000Z"}
          freezeClock={thanks}
          rsvpStartsOpen={searchParams.rsvp === "open" || success}
          rsvpInitialSuccess={success ? { name: "Alex", attending: true } : null}
        />
      </InvitationPublicProvider>
    </EventSiteFonts>
  );
}
