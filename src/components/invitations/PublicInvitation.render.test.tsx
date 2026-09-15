import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InvitationStateView, PublicInvitation, type PublicInvitationEvent } from "./PublicInvitation";
import type { InvitationMediaSnapshot } from "@/lib/invitations/media";

Object.assign(globalThis, { React });

test("full preview renders private media and locale with the RSVP form initially collapsed", () => {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="es" messages={esMessages} timeZone="America/New_York">
    <PublicInvitation event={{ ...event, locale: "es" }} state="published" media={media} rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} preview />
  </NextIntlClientProvider>);
  assert.match(html, /https:\/\/signed.example.test\/video/);
  assert.match(html, /Mia and Lee/);
  assert.match(html, /<button[^>]*>Responder a esta invitación<\/button>/);
  assert.doesNotMatch(html, /name="primaryName"/);
});

const event: PublicInvitationEvent = {
  id: "event-1",
  slug: "mia-and-lee",
  eventType: "wedding",
  locale: "en",
  title: "Mia & Lee",
  honoreeNames: "Mia and Lee",
  description: "Celebrate with us — exactly as written.",
  startsAt: "2026-10-10T22:00:00.000Z",
  endsAt: "2026-10-11T03:00:00.000Z",
  timezone: "America/New_York",
  venueName: "The Garden",
  address: "42 Celebration Way",
  mapUrl: "https://maps.example.test/garden",
  themeKey: "classic",
  primaryColor: "#18253A",
  accentColor: "#9B6A44",
  fontPairKey: "fraunces-geist",
  designRecipe: null,
  showPublicRsvpCount: true,
};

const media: InvitationMediaSnapshot = {
  designedInvite: { kind: "designed_invite", path: "event-1/designed_invite/a.png", url: "https://signed.example.test/invite" },
  cover: { kind: "cover", path: "event-1/cover/a.png", url: "https://signed.example.test/cover" },
  video: { kind: "video", path: "event-1/video/a.mp4", url: "https://signed.example.test/video" },
  gallery: [{ id: "photo-1", kind: "gallery", path: "event-1/gallery/a.png", url: "https://signed.example.test/gallery", altText: "Mia and Lee outdoors", sortOrder: 0 }],
};

function render(
  state: "published" | "rsvp_closed" | "expired" | "draft",
  overrides: Partial<PublicInvitationEvent> = {},
  locale: "en" | "es" = "en",
): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "es" ? esMessages : enMessages}
      timeZone={event.timezone}
    >
      {state === "draft" || state === "expired" ? (
        <InvitationStateView state={state} />
      ) : (
        <PublicInvitation
          event={{ ...event, locale, ...overrides }}
          state={state}
          media={media}
          rsvpSummary={{ attendingPeople: 17, declinedParties: 3 }}
        />
      )}
    </NextIntlClientProvider>,
  );
}

test("a published invitation exposes useful public details and only aggregate RSVP counts", () => {
  const html = render("published");

  for (const expected of ["Mia and Lee", "42 Celebration Way", "https://maps.example.test/garden", "Respond to this invitation", "17 attending", "3 parties unable to attend"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(html, /https:\/\/calendar\.google\.com\/calendar\/render/);
  assert.match(html, /<button[^>]*>Respond to this invitation<\/button>/);
  assert.doesNotMatch(html, /name="primaryName"/, "the full RSVP form should stay closed until requested");
  for (const privateGuestValue of ["guest@example.com", "+19175550199", "peanut allergy", "Guest Two"]) {
    assert.doesNotMatch(html, new RegExp(privateGuestValue.replace("+", "\\+"), "i"));
  }
});

test("expired and draft states reveal no authored details or signed media", () => {
  for (const state of ["expired", "draft"] as const) {
    const html = render(state);
    for (const privateValue of ["Mia", "42 Celebration Way", "The Garden", "exactly as written", "signed.example.test"]) {
      assert.doesNotMatch(html, new RegExp(privateValue));
    }
  }
  assert.match(render("expired"), /This event has ended/);
  assert.match(render("draft"), /This invitation is unavailable/);
});

test("public totals disappear completely when the owner disables them", () => {
  const html = render("published", { showPublicRsvpCount: false });
  assert.doesNotMatch(html, /17 attending|3 unable to attend|guest count|RSVP count/i);
});

test("closed invitations keep their details but replace the new RSVP action", () => {
  const html = render("rsvp_closed");
  assert.match(html, /Mia and Lee/);
  assert.match(html, /42 Celebration Way/);
  assert.match(html, /Responses are closed/);
  assert.doesNotMatch(html, /Respond to this invitation/);
});

test("Spanish event locale translates system copy without changing authored copy", () => {
  const html = render("published", {}, "es");
  assert.match(html, /Responder a esta invitación/);
  assert.match(html, /17 asistirán/);
  assert.match(html, /Celebrate with us — exactly as written\./);
});

test("the three public themes produce structurally different invitation layouts", () => {
  const classic = render("published", { themeKey: "classic" });
  const romantic = render("published", { themeKey: "romantic" });
  const celebration = render("published", { themeKey: "celebration" });

  assert.match(classic, /data-invitation-layout="centered-frame"/);
  assert.match(romantic, /data-invitation-layout="image-asymmetry"/);
  assert.match(celebration, /data-invitation-layout="offset-blocks"/);
});

test("the cover opens the invitation and the private designed reference is never rendered", () => {
  const html = render("published");
  assert.match(html, /data-invitation-hero="cover"/);
  assert.match(html, /https:\/\/signed\.example\.test\/cover/);
  assert.doesNotMatch(html, /https:\/\/signed\.example\.test\/invite/);
  assert.equal((html.match(/<h1/g) ?? []).length, 1, "the opening should be the only invitation title block");
  assert.ok(html.indexOf("Mia and Lee") < html.indexOf("Saturday, October 10, 2026"), "the date should sit below the title in the opening composition");
});

test("the honoree names lead the hero while a distinct extracted title supports them", () => {
  const html = render("published", { title: "Save the Date in style", honoreeNames: "Mercy & John" });
  assert.match(html, /<h1[^>]*>Mercy &amp; John<\/h1>/);
  assert.match(html, /data-invitation-kicker="true"[^>]*>Save the Date in style<\/p>/);
});

test("gallery photos stack on mobile and balance into two columns on larger screens", () => {
  const galleryMedia = {
    ...media,
    gallery: [
      media.gallery[0]!,
      { ...media.gallery[0]!, id: "photo-2", path: "event-1/gallery/b.png", url: "https://signed.example.test/gallery-2", sortOrder: 1 },
    ],
  };
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={enMessages} timeZone={event.timezone}>
    <PublicInvitation event={event} state="published" media={galleryMedia} rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} />
  </NextIntlClientProvider>);
  assert.match(html, /data-invitation-gallery="true"[^>]*class="[^"]*grid-cols-1[^"]*sm:grid-cols-2/);
});

test("optional travel information highlights one hotel and links guest directions", () => {
  const travelEvent = {
    ...event,
    travelInfo: {
      airports: [{ name: "Dallas Fort Worth International", note: "About 35 minutes from the venue", directionsUrl: "https://maps.example.test/dfw" }],
      hotels: [
        { name: "The Grand Hotel", address: "10 Main Street, Dallas, TX", recommended: true },
        { name: "City Lodge", address: "20 Oak Road, Dallas, TX", recommended: false },
      ],
    },
  } as PublicInvitationEvent;
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={enMessages} timeZone={event.timezone}>
    <PublicInvitation event={travelEvent} state="published" media={{ ...media, gallery: [], video: null }} rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} />
  </NextIntlClientProvider>);
  for (const expected of ["Travel information", "Closest airports", "Dallas Fort Worth International", "Recommended hotel", "The Grand Hotel", "City Lodge"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(html, /https:\/\/maps\.example\.test\/dfw/);
  assert.match(html, /https:\/\/www\.google\.com\/maps\/search\/\?api=1&amp;query=10%20Main%20Street%2C%20Dallas%2C%20TX/);
});

test("travel information stays hidden when the optional lists are empty", () => {
  const html = render("published", { travelInfo: { airports: [], hotels: [] } } as Partial<PublicInvitationEvent>);
  assert.doesNotMatch(html, /Travel information|Closest airports|Nearby hotels/);
});

test("optional structured style guidance renders outside the welcome description", () => {
  const html = render("published", {
    styleGuide: { note: "Glamorous fascinators", colors: [{ name: "Sage", color: "#AAB39A" }] },
  });
  assert.match(html, /Style guide/i);
  assert.match(html, /Glamorous fascinators/);
  assert.match(html, /aria-label="Sage: #AAB39A"/);
  assert.equal((html.match(/Glamorous fascinators/g) ?? []).length, 1);
});
