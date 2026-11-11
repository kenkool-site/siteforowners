"use client";

import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import {
  buildHonorReview,
  buildPublicHonor,
  honorProfileForEventType,
  type HonorMediaRef,
  type HonorPerson,
  type HostHonorFace,
  type HostHonorState,
  type PublicHonorView,
} from "@/lib/invitations/memories/guests-of-honor";
import type { GuestHighlightGroup } from "./GuestAiHighlightView";
import { GuestMemoriesApp } from "./GuestMemoriesApp";
import { GuestsOfHonorFlow, type HonorSitePhoto } from "./GuestsOfHonorFlow";

const PALETTE = { accent: "#1f4a2c", background: "#efede5", text: "#1c2a20", surface: "#fbfaf6" };

function paint(id: string): string {
  const colors = ["#c9a27a", "#3b4c6b", "#7f9a78", "#e7b8bf", "#d4a85a", "#5d8f8a", "#efe6d8", "#7d6a9c"];
  const color = colors[id.charCodeAt(id.length - 1) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function item(id: string, name: string | null = null): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: name,
    objectKeyDisplay: "d",
    objectKeyThumbnail: "t",
    capturedAt: "2026-12-19T19:20:00.000Z",
    uploadedAt: "2026-12-19T19:21:00.000Z",
    durationSeconds: null,
  };
}

const weddingMedia = [item("m1", "Chanelle"), item("m2", "ken"), item("m3", null), item("m4", "Chanelle"), item("m5", "ken"), item("m6", null)];
const birthdayMedia = [item("b1", "ken"), item("b2", "Chanelle"), item("b3", null), item("b4", "ken"), item("b5", null), item("b6", "Chanelle")];

const mercy: HonorPerson = { id: "h1", name: "Mercy", roleKey: "bride", selected: true };
const john: HonorPerson = { id: "h2", name: "John", roleKey: "groom", selected: true };
const amara: HonorPerson = { id: "a", name: "Amara", roleKey: "birthday_star", selected: true };

function asRef(media: PublicMemoryMedia[]): HonorMediaRef[] {
  return media.map((entry) => ({ ...entry, durationSeconds: entry.durationSeconds ?? null }));
}

function weddingHonor(): PublicHonorView {
  const view = buildPublicHonor({
    profile: honorProfileForEventType("wedding"),
    honorees: [mercy, john],
    matches: [
      { mediaId: "m1", honoreeId: "h1", excluded: false, similarity: 97 },
      { mediaId: "m1", honoreeId: "h2", excluded: false, similarity: 96 },
      { mediaId: "m4", honoreeId: "h1", excluded: false, similarity: 95 },
      { mediaId: "m4", honoreeId: "h2", excluded: false, similarity: 94 },
      { mediaId: "m2", honoreeId: "h1", excluded: false, similarity: 93 },
      { mediaId: "m5", honoreeId: "h2", excluded: false, similarity: 92 },
    ],
    media: asRef(weddingMedia),
  });
  if (!view) throw new Error("sample wedding honor view missing");
  return view;
}

function birthdayHonor(): PublicHonorView {
  const view = buildPublicHonor({
    profile: honorProfileForEventType("birthday"),
    honorees: [amara, { id: "x", name: "", roleKey: "birthday_star", selected: false }],
    matches: ["b1", "b2", "b4", "b6"].map((mediaId) => ({ mediaId, honoreeId: "a", excluded: false, similarity: 96 })),
    media: asRef(birthdayMedia),
  });
  if (!view) throw new Error("sample birthday honor view missing");
  return view;
}

const weddingFaces: HostHonorFace[] = [
  { index: 0, name: "Mercy", roleKey: "bride", selected: true, box: { left: 0.14, top: 0.16, width: 0.28, height: 0.62 } },
  { index: 1, name: "John", roleKey: "groom", selected: true, box: { left: 0.56, top: 0.2, width: 0.28, height: 0.6 } },
];

const birthdayFaces: HostHonorFace[] = [
  { index: 0, name: "Amara", roleKey: "birthday_star", selected: true, box: { left: 0.36, top: 0.08, width: 0.26, height: 0.7 } },
  { index: 1, name: "", roleKey: "birthday_star", selected: false, box: { left: 0.08, top: 0.22, width: 0.2, height: 0.55 } },
  { index: 2, name: "", roleKey: "birthday_star", selected: false, box: { left: 0.7, top: 0.24, width: 0.2, height: 0.52 } },
];

function reviewState(kind: "wedding" | "birthday", photoCount: number): HostHonorState {
  const honorees = kind === "wedding" ? [mercy, john] : [amara];
  const matches = kind === "wedding"
    ? [
      { mediaId: "m1", honoreeId: "h1", excluded: false, similarity: 97 },
      { mediaId: "m1", honoreeId: "h2", excluded: false, similarity: 96 },
      { mediaId: "m4", honoreeId: "h1", excluded: false, similarity: 95 },
      { mediaId: "m4", honoreeId: "h2", excluded: false, similarity: 94 },
      { mediaId: "m2", honoreeId: "h1", excluded: false, similarity: 93 },
      { mediaId: "m5", honoreeId: "h2", excluded: false, similarity: 92 },
    ]
    : ["b1", "b2", "b4", "b6"].map((mediaId) => ({ mediaId, honoreeId: "a", excluded: false, similarity: 96 }));
  return { status: "ready", faces: kind === "wedding" ? weddingFaces : birthdayFaces, photoCount, review: buildHonorReview(honorees, matches), lastError: null };
}

function sitePhotos(): HonorSitePhoto[] {
  return [
    { ref: "cover", kind: "cover", label: "cover", url: paint("cover") },
    { ref: "g1", kind: "gallery", label: "", url: paint("g1") },
    { ref: "g2", kind: "gallery", label: "", url: paint("g2") },
    { ref: "g3", kind: "gallery", label: "", url: paint("g3") },
  ];
}

export function GuestsOfHonorPreview({ variant, screen }: { variant: "wedding" | "birthday"; screen: string }) {
  const wedding = variant === "wedding";
  const title = wedding ? "Mercy & John" : "Amara's 30th";
  const eventType = wedding ? "wedding" : "birthday";
  const honor = wedding ? weddingHonor() : birthdayHonor();
  const media = wedding ? weddingMedia : birthdayMedia;
  const highlights: GuestHighlightGroup[] = [
    { id: "night", eventId: "preview", name: "Best of the night", description: null, semanticKey: "night", source: "ai_generated", sortOrder: 1, isVisible: true, media: media.slice(0, 2) },
    { id: "dance", eventId: "preview", name: wedding ? "First dance" : "Cake", description: null, semanticKey: "dance", source: "ai_generated", sortOrder: 2, isVisible: true, media: media.slice(2, 4) },
  ];
  const guestScreen = screen === "highlights" || screen === "gallery" || screen === "viewer" || screen === "banner";
  return (
    <InvitationPublicProvider locale="en" timeZone="America/Chicago">
      {guestScreen ? (
        <GuestMemoriesApp
          eventId="preview-event"
          eventTitle={title}
          slug="preview"
          accent={PALETTE.accent}
          background={PALETTE.background}
          text={PALETTE.text}
          surface={PALETTE.surface}
          findMeEnabled
          brandingEnabled
          startsAt={screen === "banner" ? "2026-12-19T19:00:00.000Z" : "2026-12-19T19:00:00.000Z"}
          timeZone="America/Chicago"
          venueName={wedding ? "The Bliss" : "Dallas"}
          address={wedding ? "Aubrey, TX" : "TX"}
          eventType={eventType}
          locale="en"
          viewerIsHost={screen === "banner"}
          preview={{
            now: screen === "banner" ? Date.parse("2026-11-11T18:00:00.000Z") : Date.parse("2026-12-19T23:00:00.000Z"),
            media: screen === "banner" ? [] : media,
            moments: [],
            highlights,
            viewerMediaIds: [],
            imageSrc: (id) => paint(id),
            openViewer: screen === "viewer",
            screen: screen === "highlights" ? "highlights" : "gallery",
            honor,
            viewerIsHost: screen === "banner",
          }}
        />
      ) : (
        <GuestsOfHonorFlow
          eventId="preview-event"
          eventTitle={title}
          eventType={eventType}
          backHref="/dev/guests-of-honor-preview"
          brandingOn
          reviewRequired={false}
          initial={null}
          preview={{
            screen: screen === "picker" || screen === "confirm" || screen === "processing" || screen === "review" ? screen : "settings",
            photos: sitePhotos(),
            faces: wedding ? weddingFaces : birthdayFaces,
            consent: true,
            state: screen === "settings" ? { status: "empty", faces: [], photoCount: media.length, review: null, lastError: null } : reviewState(variant, media.length),
            referenceSrc: paint(wedding ? "cover" : "b1"),
            imageFor: (id) => paint(id),
          }}
        />
      )}
    </InvitationPublicProvider>
  );
}
