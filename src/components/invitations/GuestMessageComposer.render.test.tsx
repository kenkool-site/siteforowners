import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
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

function render(): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <GuestMessageComposer
        eventId="event-1"
        eventName="Mercy & John"
        backHref="/invitations/manage/event-1"
        templateValues={templateValues}
        smsBudget={{ limit: 500, remaining: 420 }}
        initialRecipientCounts={{ email: 8, sms: 5 }}
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
        smsBudget={null}
        initialRecipientCounts={{ email: 1, sms: 1 }}
        initialTotalResponses={1}
        initialHistory={[]}
      />
    </NextIntlClientProvider>,
  );
  for (const expected of ["Compartir fotos", "Día anterior", "Vestimenta", "En vivo", "Fecha límite de RSVP"]) {
    assert.match(html, new RegExp(expected));
  }
});
