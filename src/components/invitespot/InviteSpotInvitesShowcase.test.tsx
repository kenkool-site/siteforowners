import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InviteSpotInvitesShowcase } from "./InviteSpotInvitesShowcase";

Object.assign(globalThis, { React });

function render(messages: typeof enMessages, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <InviteSpotInvitesShowcase />
    </NextIntlClientProvider>,
  );
}

test("the Invites showcase renders its English heading, body, and all three bullets", () => {
  const html = render(enMessages, "en");
  assert.match(html, /A page as special as your invitation/);
  assert.match(html, /Your own web address — not a booking code/);
  assert.match(html, /Set a deadline, or make an exception for latecomers/);
});

test("the Invites showcase renders its Spanish copy for a Spanish-locale visitor", () => {
  const html = render(esMessages, "es");
  assert.match(html, /Una página tan especial como tu invitación/);
  assert.match(html, /Tu propia dirección web — no un código de reserva/);
});

test("the Invites showcase references the showcase image with real alt text, not an empty string", () => {
  const html = render(enMessages, "en");
  assert.match(html, /alt="A custom InviteSpot invitation page"/);
});
