import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { OwnerGuestDashboard } from "./OwnerGuestDashboard";
import type { InvitationResponsesDashboard } from "./ResponsesDashboard";

Object.assign(globalThis, { React });

const responses: InvitationResponsesDashboard = {
  responses: [{
    id: "00000000-0000-4000-8000-000000000001",
    eventId: "event-1",
    primaryName: "Kenneth Afolabi",
    email: "kenneth@example.test",
    phone: "+16785550123",
    attending: true,
    partySize: 2,
    additionalGuestNames: ["Guest Two"],
    dietaryOrAccessibilityNotes: null,
    message: null,
    createdAt: "2026-09-15T12:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  }],
  filteredTotal: 1,
  page: 1,
  perPage: 25,
  summary: { attendingPeople: 2, attendingParties: 1, declinedParties: 0, remainingCapacity: null, totalSubmissions: 1 },
  notificationWarningCount: 0,
  warnings: [],
  failedNotifications: [],
};

test("owner landing page leads with guests and keeps customization as a secondary action", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <OwnerGuestDashboard
        event={{ id: "event-1", title: "You're Invited", honoreeNames: "Mercy & John", status: "published", slug: "mercy-john", publicSubdomain: "mercy-john" }}
        initialData={responses}
      />
    </NextIntlClientProvider>,
  );

  assert.match(html, /Guest responses/);
  assert.match(html, /Kenneth Afolabi/);
  assert.match(html, /kenneth@example\.test/);
  assert.match(html, /\+16785550123/);
  assert.match(html, /href="\/invitations\/manage\/event-1\/edit"[^>]*>Customize invitation</);
  assert.match(html, /Preview invitation/);
  assert.match(html, /Copy guest link/);
  assert.doesNotMatch(html, /Event type|Welcome message|Invitation language/);
});

test("owner dashboard links to the guest message composer", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <OwnerGuestDashboard
        event={{ id: "event-1", title: "You're Invited", honoreeNames: "Mercy & John", status: "published", slug: "mercy-john", publicSubdomain: "mercy-john" }}
        initialData={responses}
      />
    </NextIntlClientProvider>,
  );
  assert.match(html, /Guest messages/);
  assert.match(html, /href="\/invitations\/manage\/event-1\/message"/);
});
