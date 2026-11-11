"use client";

import { InvitationPublicProvider } from "@/components/invitations/InvitationPublicProvider";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";
import type { GuestHighlightGroup } from "./GuestAiHighlightView";
import { GuestMemoriesApp } from "./GuestMemoriesApp";

const PALETTE = { accent: "#1f4a2c", background: "#efede5", text: "#1c2a20", surface: "#fbfaf6" };
const NOW = Date.parse("2026-12-19T23:00:00.000Z");

function paint(id: string): string {
  const colors = ["#c9a27a", "#3b4c6b", "#7f9a78", "#e7b8bf", "#d4a85a", "#5d8f8a", "#efe6d8", "#7d6a9c"];
  const color = colors[id.charCodeAt(id.length - 1) % colors.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="640"><rect width="100%" height="100%" fill="${color}"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function item(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: id.endsWith("1") || id.endsWith("4") ? "Chanelle" : id.endsWith("2") ? "ken" : null,
    objectKeyDisplay: "d",
    objectKeyThumbnail: "t",
    capturedAt: "2026-12-19T19:20:00.000Z",
    uploadedAt: "2026-12-19T19:21:00.000Z",
    durationSeconds: null,
    ...overrides,
  };
}

const moments: MemoryMoment[] = [
  { id: "ceremony", name: "Ceremony", startsAt: "2026-12-19T19:00:00.000Z", endsAt: "2026-12-19T20:00:00.000Z", sortOrder: 0 },
  { id: "cocktails", name: "Cocktail hour", startsAt: "2026-12-19T20:00:00.000Z", endsAt: "2026-12-19T23:30:00.000Z", sortOrder: 1 },
  { id: "reception", name: "Reception", startsAt: "2026-12-19T23:30:00.000Z", endsAt: "2026-12-20T03:00:00.000Z", sortOrder: 2 },
];

const media: PublicMemoryMedia[] = [
  item("m1", { capturedAt: "2026-12-19T19:10:00.000Z" }),
  item("m2", { capturedAt: "2026-12-19T19:25:00.000Z", mediaKind: "video", durationSeconds: 24 }),
  item("m3", { capturedAt: "2026-12-19T19:40:00.000Z", uploaderDisplayName: null }),
  item("m4", { capturedAt: "2026-12-19T19:50:00.000Z" }),
  item("m5", { capturedAt: "2026-12-19T19:15:00.000Z", uploaderDisplayName: "ken" }),
  item("m6", { capturedAt: "2026-12-19T19:35:00.000Z", uploaderDisplayName: null }),
];

const highlights: GuestHighlightGroup[] = [
  { id: "g1", eventId: "preview", name: "The couple", description: null, semanticKey: "couple", source: "ai_generated", sortOrder: 0, isVisible: true, media: [media[0], media[3]] },
  { id: "g2", eventId: "preview", name: "First dance", description: null, semanticKey: "dance", source: "ai_generated", sortOrder: 1, isVisible: true, media: [media[4]] },
];

export function MemoriesDesignPreview({ screen }: { screen: string }) {
  const empty = screen === "empty";
  const future = "2026-12-19T19:00:00.000Z";
  return (
    <InvitationPublicProvider locale="en" timeZone="America/Chicago">
      <GuestMemoriesApp
        eventId="preview-event"
        eventTitle="Mercy & John"
        slug="mercy-john"
        accent={PALETTE.accent}
        background={PALETTE.background}
        text={PALETTE.text}
        surface={PALETTE.surface}
        findMeEnabled
        brandingEnabled
        startsAt={empty ? future : "2026-12-19T19:00:00.000Z"}
        timeZone="America/Chicago"
        venueName="The Bliss"
        address="Aubrey, TX"
        eventType="wedding"
        locale="en"
        schedule={[]}
        preview={{
          now: empty ? Date.parse("2026-11-11T18:00:00.000Z") : NOW,
          media: empty ? [] : media,
          moments,
          highlights: screen === "highlights-empty" ? [] : highlights,
          viewerMediaIds: ["m1", "m4"],
          imageSrc: (id) => paint(id),
          openViewer: screen === "viewer",
          openAbout: screen === "about",
          screen: screen === "album" ? "find" : screen === "highlights-empty" || screen === "highlights-loading" ? screen : screen === "moments" || screen === "highlights" || screen === "find" ? screen : "gallery",
          findResults: screen === "album" ? media : undefined,
          uploadStep: screen.startsWith("add-") ? (screen.slice(4) as "name" | "source" | "review" | "uploading" | "browsing" | "success") : undefined,
          uploadPreviews: [paint("a"), paint("b"), paint("c"), paint("d")],
        }}
      />
    </InvitationPublicProvider>
  );
}
