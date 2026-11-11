import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGallerySections,
  contributorSummary,
  countdownDays,
  filterGalleryMedia,
  formatVideoDuration,
  invitespotGuestUrl,
  knownContributorName,
  minutesUntil,
  momentPhase,
  shotSuggestions,
  suggestMomentId,
  venueLine,
  viewerMediaIdsForSession,
} from "./guest-presentation";
import type { MemoryMedia } from "./types";
import type { PublicMemoryMedia } from "./gallery";
import type { MemoryMoment } from "./repository";

const NOW = new Date("2026-12-01T18:00:00.000Z");

function media(id: string, overrides: Partial<PublicMemoryMedia> = {}): PublicMemoryMedia {
  return {
    id,
    mediaKind: "photo",
    uploaderDisplayName: null,
    objectKeyDisplay: "d",
    objectKeyThumbnail: "t",
    capturedAt: "2026-12-19T19:30:00.000Z",
    uploadedAt: "2026-12-19T19:31:00.000Z",
    ...overrides,
  };
}

function moment(id: string, name: string, startsAt: string, endsAt: string, sortOrder: number): MemoryMoment {
  return { id, name, startsAt, endsAt, sortOrder };
}

test("guest links use the InviteSpot homepage and the memories UTM set", () => {
  const url = new URL(invitespotGuestUrl("mercy-john", "footer"));
  assert.equal(url.origin + url.pathname, "https://www.invitespot.app/");
  assert.equal(url.searchParams.get("utm_source"), "memories");
  assert.equal(url.searchParams.get("utm_medium"), "guest_page");
  assert.equal(url.searchParams.get("utm_campaign"), "mercy-john");
  assert.equal(url.searchParams.get("utm_content"), "footer");
});

test("countdown is null once the event has started and otherwise counts whole days", () => {
  assert.equal(countdownDays("2026-12-19T18:00:00.000Z", NOW), 18);
  assert.equal(countdownDays("2026-12-01T18:00:00.000Z", NOW), null);
  assert.equal(countdownDays(null, NOW), null);
});

test("contributor summary keeps real names only and caps the visible list at two", () => {
  assert.deepEqual(contributorSummary([null, " ken ", "Chanelle", "Ken", "Ada"]), { named: ["ken", "Chanelle"], more: 1 });
  assert.equal(knownContributorName("  "), null);
  assert.equal(knownContributorName("Chanelle"), "Chanelle");
});

test("video length is omitted when the event never stored a duration", () => {
  assert.equal(formatVideoDuration(24), "0:24");
  assert.equal(formatVideoDuration(75), "1:15");
  assert.equal(formatVideoDuration(null), null);
  assert.equal(formatVideoDuration(undefined), null);
});

test("gallery sections follow moments and leave unnamed uploads without a fake caption group", () => {
  const moments = [
    moment("ceremony", "Ceremony", "2026-12-19T18:00:00.000Z", "2026-12-19T19:00:00.000Z", 0),
    moment("reception", "Reception", "2026-12-19T22:00:00.000Z", "2026-12-20T02:00:00.000Z", 1),
  ];
  const sections = buildGallerySections(
    [
      media("early", { capturedAt: "2026-12-19T18:10:00.000Z" }),
      media("late", { capturedAt: "2026-12-19T22:30:00.000Z" }),
      media("late-2", { capturedAt: "2026-12-19T23:00:00.000Z", mediaKind: "video" }),
    ],
    moments,
    "America/Chicago",
    "en-US",
  );
  assert.deepEqual(sections.map((section) => section.title), ["Reception", "Ceremony"]);
  assert.equal(sections[0].items.length, 2);
  assert.equal(sections[1].items[0].id, "early");
});

test("filters only hide videos or the viewer's own ids", () => {
  const items = [media("a"), media("b", { mediaKind: "video" }), media("c")];
  assert.equal(filterGalleryMedia(items, "videos", new Set()).length, 1);
  assert.deepEqual(filterGalleryMedia(items, "mine", new Set(["c"])).map((item) => item.id), ["c"]);
  assert.equal(filterGalleryMedia(items, "all", new Set()).length, 3);
});

test("shot list comes from the host schedule and is empty when the host has not set one", () => {
  const shots = shotSuggestions(
    [moment("ceremony", "Ceremony", "2026-12-19T19:00:00.000Z", "2026-12-19T20:00:00.000Z", 0)],
    [],
    "America/Chicago",
    "en-US",
  );
  assert.equal(shots[0].title, "Ceremony");
  assert.match(shots[0].hint, /1:00/);
  assert.deepEqual(shotSuggestions([], [], "America/Chicago", "en-US"), []);
});

test("moment phase and the suggested moment use the photo time, not a hardcoded reception", () => {
  const reception = moment("reception", "Reception", "2026-12-19T22:00:00.000Z", "2026-12-20T02:00:00.000Z", 1);
  const ceremony = moment("ceremony", "Ceremony", "2026-12-19T18:00:00.000Z", "2026-12-19T19:00:00.000Z", 0);
  assert.equal(momentPhase(reception, new Date("2026-12-19T21:00:00.000Z")), "upcoming");
  assert.equal(momentPhase(reception, new Date("2026-12-19T22:30:00.000Z")), "open");
  assert.equal(minutesUntil(reception.startsAt, new Date("2026-12-19T21:50:00.000Z")), 10);
  assert.equal(
    suggestMomentId([Date.parse("2026-12-19T18:20:00.000Z")], [ceremony, reception]),
    "ceremony",
  );
});

test("venue line does not repeat the venue name when it is already in the address", () => {
  assert.equal(venueLine("The Bliss", "Aubrey, TX"), "The Bliss, Aubrey, TX");
  assert.equal(venueLine("The Bliss at Aubrey, TX", "The Bliss at Aubrey, TX"), "The Bliss at Aubrey, TX");
});

test("viewer media ids match the signed session and never include other guests", () => {
  const row = (id: string, sessionId: string | null, rsvpId: string | null): MemoryMedia => ({
    id,
    eventId: "event-1",
    uploaderRsvpId: rsvpId,
    uploaderSessionId: sessionId,
    uploaderDisplayName: null,
    guestSessionLevel: "anonymous",
    mediaKind: "photo",
    objectKeyOriginal: "o",
    objectKeyDisplay: null,
    objectKeyThumbnail: null,
    capturedAt: null,
    uploadedAt: "2026-12-19T00:00:00.000Z",
    uploadStatus: "uploaded",
    processingStatus: "ready",
    moderationStatus: "approved",
    aiStatus: "not_started",
    moderationScore: null,
    moderationCategories: null,
  });
  const mediaRows = [row("mine", "session-1", null), row("theirs", "session-2", null), row("rsvp", null, "rsvp-9")];
  assert.deepEqual(viewerMediaIdsForSession(mediaRows, { sessionId: "session-1" }), ["mine"]);
  assert.deepEqual(viewerMediaIdsForSession(mediaRows, { rsvpId: "rsvp-9" }), ["rsvp"]);
  assert.deepEqual(viewerMediaIdsForSession(mediaRows, null), []);
});
