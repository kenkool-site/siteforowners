import assert from "node:assert/strict";
import test from "node:test";
import { formatEventWhen } from "./event-site";
import {
  invitationOgPlan,
  invitationPageMetadata,
  resolvePublicInvitationPage,
  resolveInvitationPreview,
  getInvitationReferralDisplayName,
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
    venueUrl: null,
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
    rsvpDeadline: null,
    rsvpOverrideOpen: false,
    status: "published",
    expireAt: "2027-10-12T04:00:00.000Z",
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

test("unknown and offline events resolve as not found", async () => {
  assert.deepEqual(await resolvePublicInvitationPage("unknown", new Date("2026-10-01"), {
    find: async () => null,
  }), { kind: "not_found" });
  assert.deepEqual(await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
    find: async () => ({ ...invitation, event: { ...invitation.event, status: "offline" } }),
  }), { kind: "not_found" });
});

test("draft and expired invitations resolve to their safe state", async () => {
  for (const [status, kind] of [["draft", "unavailable"], ["expired", "ended"]] as const) {
    const result = await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
      find: async () => ({ ...invitation, event: { ...invitation.event, status } }),
    });
    assert.equal(result.kind, kind);
  }
});

test("published and RSVP-closed invitations resolve to details regardless of passcode (middleware gates access)", async () => {
  for (const status of ["published", "rsvp_closed"] as const) {
    const result = await resolvePublicInvitationPage("mia-and-lee", new Date("2026-10-01"), {
      find: async () => ({ ...invitation, passcodeHash: "stored", event: { ...invitation.event, status } }),
    });
    assert.equal(result.kind, "details");
  }
});

test("published invitations advertise the event on invitespot.app, never SiteForOwners", () => {
  const publicMetadata = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, title: "Save the Date", publicSubdomain: "mia-lee", coverImagePath: "event-1/cover/share.png" },
  }, "published");
  const when = formatEventWhen(invitation.event.startsAt, invitation.event.timezone, "en");
  assert.ok(when);
  assert.equal(publicMetadata.title, "You're invited: Mia and Lee");
  assert.equal(publicMetadata.description, `Save the Date · ${when} · The Garden · Celebrate with us`);
  assert.equal(publicMetadata.openGraph?.title, "You're invited: Mia and Lee");
  assert.equal(publicMetadata.openGraph?.description, publicMetadata.description);
  assert.equal(publicMetadata.openGraph?.siteName, "InviteSpot");
  assert.equal(publicMetadata.openGraph?.url, "https://mia-lee.invitespot.app/");
  assert.equal(publicMetadata.applicationName, "InviteSpot");
  assert.equal(publicMetadata.metadataBase?.href, "https://mia-lee.invitespot.app/");
  assert.equal(publicMetadata.twitter?.title, "You're invited: Mia and Lee");
  assert.deepEqual(publicMetadata.robots, { index: true, follow: true });
  assert.equal(publicMetadata.alternates?.canonical, "https://mia-lee.invitespot.app/");
  assert.deepEqual(publicMetadata.openGraph?.images, [{
    url: "https://mia-lee.invitespot.app/api/invitations/public/mia-and-lee/og",
    width: 1200,
    height: 630,
    alt: "Mia and Lee",
  }]);
  assert.match(JSON.stringify(publicMetadata.twitter), /summary_large_image/);
  assert.match(JSON.stringify(publicMetadata.twitter), /mia-lee\.invitespot\.app\/api\/invitations\/public\/mia-and-lee\/og/);
  assert.doesNotMatch(JSON.stringify(publicMetadata), /siteforowners|Secret Celebration Way|maps\.example|event-1\/cover/i);

  const closed = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, title: "Save the Date", publicSubdomain: "mia-lee" },
  }, "rsvp_closed");
  assert.equal(closed.title, "You're invited: Mia and Lee");
  assert.equal(closed.openGraph?.siteName, "InviteSpot");
  assert.deepEqual(closed.robots, { index: false, follow: false });
  assert.match(String(closed.description), /The Garden/);
  assert.doesNotMatch(JSON.stringify(closed), /Secret Celebration Way|siteforowners/i);

  for (const state of ["draft", "expired", "offline"] as const) {
    const metadata = invitationPageMetadata(invitation, state);
    assert.deepEqual(metadata.robots, { index: false, follow: false });
    assert.equal(metadata.openGraph?.siteName, "InviteSpot");
    assert.equal(metadata.title, "Invitation");
    assert.doesNotMatch(JSON.stringify(metadata), /Mia|Celebrate|The Garden|Secret Celebration Way|maps\.example/);
    assert.doesNotMatch(JSON.stringify(metadata), /siteforowners/i);
  }
  const protectedMetadata = invitationPageMetadata({ ...invitation, passcodeHash: "stored" }, "published");
  assert.deepEqual(protectedMetadata.robots, { index: false, follow: false });
  assert.equal(protectedMetadata.openGraph?.siteName, "InviteSpot");
  assert.equal(protectedMetadata.title, "Invitation");
  assert.doesNotMatch(JSON.stringify(protectedMetadata), /Mia|Celebrate|The Garden|Secret Celebration Way|maps\.example/);
  assert.doesNotMatch(JSON.stringify(protectedMetadata), /siteforowners/i);
  assert.doesNotMatch(JSON.stringify(protectedMetadata), /\/cover/);
});

test("private guest lists share only the names and cover the public gate already shows", () => {
  const metadata = invitationPageMetadata({
    ...invitation,
    event: {
      ...invitation.event,
      publicSubdomain: "mia-lee",
      privateGuestListEnabled: true,
      coverImagePath: "event-1/cover/share.png",
    },
  }, "published");
  assert.equal(metadata.title, "You're invited: Mia and Lee");
  assert.equal(metadata.description, "This event is invite-only.");
  assert.equal(metadata.openGraph?.siteName, "InviteSpot");
  assert.match(JSON.stringify(metadata.openGraph?.images), /mia-lee\.invitespot\.app\/api\/invitations\/public\/mia-and-lee\/og/);
  assert.doesNotMatch(JSON.stringify(metadata), /The Garden|Celebrate|Secret Celebration Way|October|event-1\/cover|siteforowners/i);
  const plan = invitationOgPlan({
    ...invitation,
    event: { ...invitation.event, privateGuestListEnabled: true, coverImagePath: "event-1/cover/share.png" },
  }, "published");
  assert.equal(plan.names, "Mia and Lee");
  assert.equal(plan.detail, "Invite-only");
  assert.deepEqual(plan.cover, { eventId: "event-1", path: "event-1/cover/share.png" });
  const hidden = invitationOgPlan({ ...invitation, passcodeHash: "stored" }, "published");
  assert.equal(hidden.names, "You're invited");
  assert.equal(hidden.detail, "");
  assert.equal(hidden.cover, null);
});

test("memories and personal RSVP previews stay on the event origin", () => {
  const event = { ...invitation.event, publicSubdomain: "mia-lee", locale: "es" as const };
  const memories = invitationPageMetadata({ ...invitation, event }, "published", { page: "memories", showBrand: true });
  assert.equal(memories.openGraph?.url, "https://mia-lee.invitespot.app/memories");
  assert.match(String(memories.title), /Fotos · InviteSpot/);
  assert.match(JSON.stringify(memories.openGraph?.images), /\/og\/memories/);
  const quiet = invitationPageMetadata({ ...invitation, event }, "published", { page: "memories", showBrand: false });
  assert.equal(quiet.openGraph?.siteName, "Mia and Lee");
  assert.doesNotMatch(String(quiet.title), /InviteSpot|SiteForOwners/);
  const personal = invitationPageMetadata({ ...invitation, event: invitation.event }, "published", {
    page: "rsvp",
    token: "K7mQ2pLx9aWc4nRb",
  });
  assert.equal(personal.openGraph?.url, "https://www.invitespot.app/i/K7mQ2pLx9aWc4nRb");
  assert.deepEqual(personal.robots, { index: false, follow: false });
  assert.match(JSON.stringify(personal.openGraph?.images), /\/api\/invitations\/public\/mia-and-lee\/og/);
  assert.doesNotMatch(JSON.stringify(personal.openGraph?.images), /K7mQ2pLx9aWc4nRb/);
});

test("invitation metadata falls back to the invitation title and avoids duplicate supporting text", () => {
  const fallback = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, honoreeNames: "", title: "Birthday Celebration" },
  }, "published");
  assert.equal(fallback.title, "You're invited: Birthday Celebration");
  assert.match(String(fallback.description), /The Garden · Celebrate with us/);

  const sameTitle = invitationPageMetadata({
    ...invitation,
    event: { ...invitation.event, honoreeNames: "  Mia and Lee  ", title: "mia and lee" },
  }, "published");
  assert.equal(sameTitle.title, "You're invited: Mia and Lee");
  assert.match(String(sameTitle.description), /The Garden · Celebrate with us/);
  assert.doesNotMatch(String(sameTitle.description), /Mia and Lee ·/);
});

test("getInvitationReferralDisplayName returns the honoree names for a published event", async () => {
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => invitation);
  assert.equal(name, "Mia and Lee");
});

test("getInvitationReferralDisplayName returns the honoree names for an rsvp_closed event", async () => {
  const fixture = { ...invitation, event: { ...invitation.event, status: "rsvp_closed" as const } };
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => fixture);
  assert.equal(name, "Mia and Lee");
});

test("getInvitationReferralDisplayName returns null for a draft event", async () => {
  const fixture = { ...invitation, event: { ...invitation.event, status: "draft" as const } };
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => fixture);
  assert.equal(name, null);
});

test("getInvitationReferralDisplayName returns null when the slug doesn't resolve", async () => {
  const name = await getInvitationReferralDisplayName("no-such-slug", async () => null);
  assert.equal(name, null);
});

test("getInvitationReferralDisplayName returns null for a passcode-protected event, even when published", async () => {
  const fixture = { ...invitation, passcodeHash: "stored" };
  const name = await getInvitationReferralDisplayName("mia-and-lee", async () => fixture);
  assert.equal(name, null);
});
