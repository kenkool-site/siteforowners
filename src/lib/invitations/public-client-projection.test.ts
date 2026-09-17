import assert from "node:assert/strict";
import test from "node:test";
import {
  resolvePublicInvitationPage,
  toPublicInvitationClientDetails,
} from "./public-access";
import type { PublicInvitationLookup } from "./repository-core";

const privateCountsInvitation: PublicInvitationLookup = {
  event: {
    id: "event-1",
    slug: "mia-and-lee",
    publicSubdomain: null,
    eventType: "wedding",
    locale: "en",
    title: "Mia & Lee",
    honoreeNames: "Mia and Lee",
    description: "Celebrate with us",
    startsAt: "2026-10-10T22:00:00.000Z",
    endsAt: null,
    timezone: "America/New_York",
    venueName: "The Garden",
    address: "42 Celebration Way",
    mapUrl: null,
    themeKey: "classic",
    primaryColor: "#18253A",
    accentColor: "#9B6A44",
    fontPairKey: "fraunces-geist",
    designRecipe: null,
    designedInvitePath: null,
    coverImagePath: null,
    videoPath: null,
    showPublicRsvpCount: false,
    commentWallEnabled: false,
    commentWallReviewedAt: null,
    rsvpDeadline: null,
    status: "published",
    expireAt: null,
  },
  passcodeHash: null,
  rsvpSummary: { attendingPeople: 93, declinedParties: 47 },
};

test("the server-to-client invitation projection redacts disabled aggregate counts", async () => {
  const resolution = await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
    find: async () => privateCountsInvitation,
    hasPasscodeAccess: () => true,
    loadMedia: async () => ({ designedInvite: null, cover: null, video: null, gallery: [] }),
  });

  assert.equal(resolution.kind, "details");
  if (resolution.kind !== "details") return;
  const clientDetails = toPublicInvitationClientDetails(resolution);

  assert.deepEqual(clientDetails.rsvpSummary, { attendingPeople: 0, declinedParties: 0 });
  assert.doesNotMatch(JSON.stringify(clientDetails), /93|47/);
});
