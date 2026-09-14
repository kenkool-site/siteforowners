import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationPublicProvider } from "./InvitationPublicProvider";
import {
  InvitationStateView,
  PublicInvitation,
  type PublicInvitationEvent,
} from "./PublicInvitation";

Object.assign(globalThis, { React });

const event: PublicInvitationEvent = {
  id: "event-1",
  slug: "mia-and-lee",
  eventType: "wedding",
  locale: "es",
  title: "Mia & Lee",
  honoreeNames: "Mia and Lee",
  description: "Celebrate with us — exactly as written.",
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
  showPublicRsvpCount: false,
};

test("the actual public client provider supplies event-locale messages without request configuration", () => {
  const html = renderToStaticMarkup(
    <InvitationPublicProvider locale="es" timeZone={event.timezone}>
      <PublicInvitation
        event={event}
        state="published"
        media={{ designedInvite: null, cover: null, video: null, gallery: [] }}
        rsvpSummary={{ attendingPeople: 0, declinedParties: 0 }}
      />
    </InvitationPublicProvider>,
  );

  assert.match(html, /Responder a esta invitación/);
  assert.match(html, /Celebrate with us — exactly as written\./);
});

test("the inactive state view needs no event props and renders no authored content", () => {
  const html = renderToStaticMarkup(
    <InvitationPublicProvider locale="es" timeZone="UTC">
      <InvitationStateView state="expired" />
    </InvitationPublicProvider>,
  );

  assert.match(html, /Este evento ha finalizado/);
  assert.doesNotMatch(html, /Mia|Garden|Celebration Way/);
});
