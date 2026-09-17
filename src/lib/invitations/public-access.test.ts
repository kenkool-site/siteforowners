import assert from "node:assert/strict";
import test from "node:test";
import {
  invitationPageMetadata,
  resolvePublicInvitationPage,
  resolveInvitationPreview,
} from "./public-access";
import type { PublicInvitationLookup } from "./repository-core";

const invitation: PublicInvitationLookup = {
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
    address: "42 Secret Celebration Way",
    mapUrl: "https://maps.example.test/secret",
    themeKey: "classic",
    primaryColor: "#18253A",
    accentColor: "#9B6A44",
    fontPairKey: "fraunces-geist",
    designRecipe: null,
    designedInvitePath: "event-1/designed_invite/a.png",
    coverImagePath: null,
    videoPath: null,
    showPublicRsvpCount: true,
    commentWallEnabled: false,
    commentWallReviewedAt: null,
    rsvpDeadline: null,
    status: "published",
    expireAt: "2026-10-12T04:00:00.000Z",
  },
  passcodeHash: null,
  rsvpSummary: { attendingPeople: 4, declinedParties: 2 },
};

const emptyMedia = { designedInvite: null, cover: null, video: null, gallery: [] };

test("preview authorizes the exact event before details or media and preserves draft locale and theme", async () => {
  for (const allowed of [false, true]) {
    const calls: string[] = [];
    const result = await resolveInvitationPreview("event-1", {
      authorize: async (id) => { assert.equal(id, "event-1"); calls.push("authorize"); return allowed; },
      find: async () => { calls.push("find"); return { ...invitation, event: { ...invitation.event, status: "draft", locale: "es", themeKey: "celebration" } }; },
      loadMedia: async () => { calls.push("media"); return emptyMedia; },
    });
    assert.deepEqual(calls, allowed ? ["authorize", "find", "media"] : ["authorize"]);
    if (allowed) {
      assert.equal(result?.event.locale, "es");
      assert.equal(result?.event.themeKey, "celebration");
      assert.equal(result?.event.description, "Celebrate with us");
    } else assert.equal(result, null);
  }
});

test("unknown and offline events resolve as not found before signing media", async () => {
  let signed = 0;
  const loadMedia = async () => {
    signed += 1;
    return emptyMedia;
  };
  assert.deepEqual(await resolvePublicInvitationPage("unknown", new Date("2026-10-01"), {
    find: async () => null,
    hasPasscodeAccess: () => false,
    loadMedia,
  }), { kind: "not_found" });
  assert.deepEqual(await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
    find: async () => ({ ...invitation, event: { ...invitation.event, status: "offline" } }),
    hasPasscodeAccess: () => false,
    loadMedia,
  }), { kind: "not_found" });
  assert.equal(signed, 0);
});

test("draft, expired, and locked invitations reveal no media before their safe state", async () => {
  for (const [status, kind] of [["draft", "unavailable"], ["expired", "ended"]] as const) {
    let signed = 0;
    const result = await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
      find: async () => ({ ...invitation, event: { ...invitation.event, status } }),
      hasPasscodeAccess: () => false,
      loadMedia: async () => {
        signed += 1;
        return emptyMedia;
      },
    });
    assert.equal(result.kind, kind);
    assert.equal(signed, 0);
  }

  let signed = 0;
  const locked = await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
    find: async () => ({ ...invitation, passcodeHash: "stored" }),
    hasPasscodeAccess: () => false,
    loadMedia: async () => {
      signed += 1;
      return emptyMedia;
    },
  });
  assert.equal(locked.kind, "passcode");
  assert.equal(signed, 0);
});

test("published and RSVP-closed invitations sign media only after access", async () => {
  for (const status of ["published", "rsvp_closed"] as const) {
    let checked = 0;
    let signed = 0;
    const result = await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
      find: async () => ({ ...invitation, passcodeHash: "stored", event: { ...invitation.event, status } }),
      hasPasscodeAccess: () => {
        checked += 1;
        return true;
      },
      loadMedia: async () => {
        signed += 1;
        return emptyMedia;
      },
    });
    assert.equal(result.kind, "details");
    assert.equal(checked, 1);
    assert.equal(signed, 1);
  }
});

test("only published passcode-free invitations receive authored metadata", () => {
  const publicMetadata = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, title: "Save the Date", publicSubdomain: "mia-lee", coverImagePath: "event-1/cover/share.png" },
  }, "published");
  assert.equal(publicMetadata.title, "Mia and Lee");
  assert.equal(publicMetadata.description, "Save the Date — Celebrate with us");
  assert.equal(publicMetadata.openGraph?.title, "Mia and Lee");
  assert.equal(publicMetadata.openGraph?.description, "Save the Date — Celebrate with us");
  assert.equal(publicMetadata.twitter?.title, "Mia and Lee");
  assert.equal(publicMetadata.twitter?.description, "Save the Date — Celebrate with us");
  assert.deepEqual(publicMetadata.robots, { index: true, follow: true });
  assert.equal(publicMetadata.alternates?.canonical, "https://mia-lee.siteforowners.com/");
  assert.deepEqual(publicMetadata.openGraph?.images, [{ url: "https://www.siteforowners.com/api/invitations/public/mia-and-lee/cover", alt: "Mia and Lee" }]);
  assert.match(JSON.stringify(publicMetadata.twitter), /summary_large_image/);
  assert.doesNotMatch(JSON.stringify(publicMetadata), /Secret Celebration Way|maps\.example/);

  for (const state of ["draft", "rsvp_closed", "expired", "offline"] as const) {
    const metadata = invitationPageMetadata(invitation, state);
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.doesNotMatch(JSON.stringify(metadata), /Mia|Celebrate|Secret Celebration Way|maps\.example/);
  }
  const protectedMetadata = invitationPageMetadata({ ...invitation, passcodeHash: "stored" }, "published");
  assert.deepEqual(protectedMetadata.robots, { index: false, follow: false });
  assert.doesNotMatch(JSON.stringify(protectedMetadata), /Mia|Celebrate|Secret Celebration Way|maps\.example/);
  assert.doesNotMatch(JSON.stringify(protectedMetadata), /\/cover/);
});

test("invitation metadata falls back to the invitation title and avoids duplicate supporting text", () => {
  const fallback = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, honoreeNames: "", title: "Birthday Celebration" },
  }, "published");
  assert.equal(fallback.title, "Birthday Celebration");
  assert.equal(fallback.description, "Celebrate with us");

  const sameTitle = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, honoreeNames: "  Mia and Lee  ", title: "mia and lee" },
  }, "published");
  assert.equal(sameTitle.title, "Mia and Lee");
  assert.equal(sameTitle.description, "Celebrate with us");
});
