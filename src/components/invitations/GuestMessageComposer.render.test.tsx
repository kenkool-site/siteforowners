import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import type { BroadcastRecipientChoice } from "@/lib/invitations/broadcasts";
import { buildMessageTemplateValues } from "@/lib/invitations/message-templates";
import { GuestMessageComposer } from "./GuestMessageComposer";

Object.assign(globalThis, { React });

const templateValues = buildMessageTemplateValues({
  locale: "en",
  title: "You're Invited",
  honoreeNames: "Mercy and John",
  slug: "mercy-john",
  publicSubdomain: "mercy-john",
  startsAt: "2026-12-19T19:00:00.000Z",
  timezone: "America/New_York",
  venueName: "The Bliss",
  address: "100 Main St",
  mapUrl: null,
  rsvpDeadline: "2026-12-12T17:00:00.000Z",
  styleGuide: null,
  additionalSections: [],
});

function people(prefix: string, count: number, contact: string): BroadcastRecipientChoice[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    name: `Guest ${index + 1}`,
    contact,
    status: index % 2 === 0 ? "attending" : "declined",
  }));
}

const recipients = {
  email: people("email", 8, "g•••@example.com"),
  sms: people("sms", 5, "••• ••• 4567"),
};

function render(): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <GuestMessageComposer
        eventId="event-1"
        eventName="Mercy & John"
        backHref="/invitations/manage/event-1"
        templateValues={templateValues}
        emailBudget={{ limit: 1000, remaining: 1000 }}
        smsBudget={{ limit: 500, remaining: 420 }}
        recipients={recipients}
        initialTotalResponses={10}
        initialHistory={[]}
      />
    </NextIntlClientProvider>,
  );
}

test("the composer exposes a channel picker, template picker, and compose fields", () => {
  const html = render();
  for (const expected of ["Email", "Text message", "Start from a template", "Thank you", "Day before", "Share photos", "Dress code", "Livestream", "Update", "Subject", "Message", "Send message"]) {
    assert.match(html, new RegExp(expected));
  }
});

test("the recipient preview reflects the initial email recipient count out of total responses", () => {
  const html = render();
  assert.match(html, /reach 8 of 10 guests/i);
  assert.match(html, /1000 of 1000 guest emails left/);
  assert.doesNotMatch(html, /420 of 500 guest texts left/);
  assert.match(html, /Guest 1/);
  assert.match(html, /g•••@example.com/);
  assert.match(html, /Select all/);
  assert.match(html, /Not attending/);
  assert.doesNotMatch(html, /\+1555|guest@example\.com/);
});

test("an empty history shows the empty state, not a broken list", () => {
  const html = render();
  assert.match(html, /No messages sent yet/);
});

test("Spanish templates render without dropping the new labels", () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="es" messages={esMessages} timeZone="America/New_York">
      <GuestMessageComposer
        eventId="event-1"
        eventName="Mercy y John"
        backHref="/invitations/manage/event-1"
        templateValues={{ ...templateValues, name: "Mercy y John", parking: "[estacionamiento]", change: "[que cambio]" }}
        emailBudget={null}
        smsBudget={null}
        recipients={{
          email: [{ id: "email-1", name: "Invitada", contact: "a•••@example.com", status: "attending" }],
          sms: [{ id: "sms-1", name: "Invitada", contact: "••• ••• 0100", status: "declined" }],
        }}
        initialTotalResponses={1}
        initialHistory={[]}
      />
    </NextIntlClientProvider>,
  );
  for (const expected of ["Compartir fotos", "Día anterior", "Vestimenta", "En vivo", "Fecha límite de RSVP"]) {
    assert.match(html, new RegExp(expected));
  }
});
