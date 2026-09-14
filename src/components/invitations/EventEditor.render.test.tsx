import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { EventEditor, type EditorEvent } from "./EventEditor";

Object.assign(globalThis, { React });

const event: EditorEvent = {
  id: "event-1",
  ownerId: "owner-1",
  slug: "ana-and-luis",
  eventType: "wedding",
  locale: "en",
  title: "Ana & Luis",
  honoreeNames: "Ana and Luis",
  description: "Join us to celebrate.",
  startsAt: "2026-10-20T22:00:00.000Z",
  endsAt: "2026-10-21T02:00:00.000Z",
  timezone: "America/New_York",
  venueName: "The Foundry",
  address: "42 Celebration Way",
  mapUrl: null,
  themeKey: "editorial",
  primaryColor: "#2B2231",
  accentColor: "#6D456F",
  fontPairKey: "fraunces-geist",
  designedInvitePath: null,
  coverImagePath: null,
  videoPath: null,
  showPublicRsvpCount: false,
  capacity: 120,
  rsvpDeadline: "2026-10-01T04:00:00.000Z",
  submissionLimit: 250,
  emailNotificationLimit: 250,
  smsNotificationLimit: 50,
  ownerEmailNotifications: true,
  ownerSmsNotifications: false,
  notificationEmail: "ana@example.com",
  notificationPhone: null,
  guestEmailConfirmations: true,
  status: "draft",
  expireAt: "2026-10-22T04:00:00.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  owner: {
    id: "owner-1",
    name: "Ana",
    email: "ana@example.com",
    phone: null,
    isActive: true,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  },
};

function render(mode: "owner" | "founder") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <EventEditor event={event} mode={mode} />
    </NextIntlClientProvider>,
  );
}

test("the event editor exposes five clearly labeled sections", () => {
  const html = render("owner");
  for (const label of ["Event", "Design", "RSVP settings", "Preview &amp; share", "Responses"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, />Save changes</);
  assert.match(html, /No unsaved changes/);
});

test("only founders see cost limit controls", () => {
  assert.doesNotMatch(render("owner"), /Submission limit/);
  assert.doesNotMatch(render("owner"), /Owner sign-in email/);
  assert.match(render("founder"), /Submission limit/);
  assert.match(render("founder"), /Owner sign-in email/);
});

test("the theme preview remains available in the mobile editing column", () => {
  assert.match(render("owner"), /data-mobile-preview="true"/);
});
