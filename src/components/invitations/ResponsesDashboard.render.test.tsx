import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import { JSDOM } from "jsdom";
import enMessages from "../../../messages/en.json";
import { PublicRsvpAggregate } from "./PublicInvitation";
import {
  ResponsesDashboard,
  type InvitationResponsesDashboard,
} from "./ResponsesDashboard";

Object.assign(globalThis, { React });

const privateResponse = {
  id: "rsvp-1",
  eventId: "event-1",
  primaryName: "Private Guest",
  email: "private@example.test",
  phone: "+19175550199",
  attending: true,
  partySize: 3,
  additionalGuestNames: ["Guest Two", "Guest Three"],
  dietaryOrAccessibilityNotes: "Peanut allergy",
  message: "Please keep this private",
  createdAt: "2026-09-13T12:00:00.000Z",
  updatedAt: "2026-09-14T12:00:00.000Z",
};

const dashboard: InvitationResponsesDashboard = {
  responses: [privateResponse],
  filteredTotal: 1,
  page: 1,
  perPage: 25,
  summary: {
    attendingPeople: 3,
    attendingParties: 1,
    declinedParties: 2,
    remainingCapacity: 7,
    totalSubmissions: 3,
  },
  notificationWarningCount: 1,
  warnings: [
    { code: "failed_delivery", count: 1 },
    { code: "capacity_reached", count: 0 },
  ],
  failedNotifications: [{ id: "notification-1", channel: "email" }],
};

function provider(children: React.ReactNode) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      {children}
    </NextIntlClientProvider>
  );
}

test("owner dashboard renders private response details, all totals, warnings, and editing controls", () => {
  const html = renderToStaticMarkup(provider(
    <ResponsesDashboard eventId="event-1" mode="owner" initialData={dashboard} />,
  ));

  for (const value of [
    "Private Guest", "private@example.test", "+19175550199", "Guest Two",
    "Peanut allergy", "3 attending", "1 attending party", "2 declined parties",
    "7 seats remaining", "3 total responses", "1 delivery warning", "Edit response",
  ]) {
    assert.match(html, new RegExp(value.replace("+", "\\+"), "i"));
  }
  assert.match(html, /data-response-ledger="true"/);
  assert.match(html, /Download CSV/);
  assert.doesNotMatch(html, /Retry delivery/);
  assert.doesNotMatch(html, /Remove guest/);

  const document = new JSDOM(html).window.document;
  const visibleContact = document.querySelector("summary [data-response-contact]")?.textContent ?? "";
  assert.match(visibleContact, /private@example\.test/);
  assert.match(visibleContact, /\+19175550199/);

  const partySize = document.querySelector("summary [data-response-party-size]");
  assert.match(partySize?.textContent ?? "", /3 people/);
  assert.doesNotMatch(
    partySize?.getAttribute("class") ?? "",
    /(?:^|\s)hidden(?:\s|$)/,
    "party size must stay visible at mobile widths, not just sm: and up",
  );

  const summarySpans = Array.from(document.querySelectorAll("summary span"));
  const viewLabel = summarySpans.find((span) => span.textContent === "View details");
  const hideLabel = summarySpans.find((span) => span.textContent === "Hide details");
  assert.ok(viewLabel, "expected a 'View details' label on the collapsed row");
  assert.ok(hideLabel, "expected a 'Hide details' label for the expanded state");
  assert.doesNotMatch(viewLabel?.getAttribute("class") ?? "", /(?:^|\s)hidden(?:\s|$)/, "'View details' is the closed-state label and must be visible by default");
  assert.match(hideLabel?.getAttribute("class") ?? "", /(?:^|\s)hidden(?:\s|$)/, "'Hide details' must stay hidden until the row is expanded");
});

test("founder dashboard exposes retry controls without rendering notification recipients", () => {
  const html = renderToStaticMarkup(provider(
    <ResponsesDashboard eventId="event-1" mode="founder" initialData={dashboard} />,
  ));

  assert.match(html, /Retry delivery/);
  assert.match(html, /Remove guest/);
  assert.doesNotMatch(html, /notification-recipient@example\.test/);
});

test("public aggregate renders only celebrating guests without private or declined response data", () => {
  const html = renderToStaticMarkup(provider(
    <PublicRsvpAggregate
      summary={{
        attendingPeople: dashboard.summary.attendingPeople,
        declinedParties: dashboard.summary.declinedParties,
      }}
      titleClass="font-sans"
      className="public-counts"
    />,
  ));

  assert.match(html, /3 guests are celebrating with us/);
  assert.doesNotMatch(html, /2 parties unable to attend|declined/i);
  for (const value of [
    privateResponse.primaryName,
    privateResponse.email,
    privateResponse.phone,
    privateResponse.additionalGuestNames[0],
    privateResponse.dietaryOrAccessibilityNotes,
    privateResponse.message,
  ]) {
    assert.doesNotMatch(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});
