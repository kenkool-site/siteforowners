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

test("full preview renders private media and locale while disabling every RSVP control", () => {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="es" messages={esMessages} timeZone="America/New_York">
    <PublicInvitation event={{ ...event, locale: "es" }} state="published" media={media} rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }} preview />
  </NextIntlClientProvider>);
  assert.match(html, /https:\/\/signed.example.test\/video/);
  assert.match(html, /Mia &amp; Lee/);
  assert.match(html, /<fieldset[^>]*disabled/);
  assert.match(html, /Vista previa/);
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

  for (const expected of ["Mia &amp; Lee", "42 Celebration Way", "https://maps.example.test/garden", "Respond to this invitation", "17 attending", "3 parties unable to attend"]) {
    assert.match(html, new RegExp(expected));
  }
  assert.match(html, /https:\/\/calendar\.google\.com\/calendar\/render/);
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
  assert.match(html, /Mia &amp; Lee/);
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
});
