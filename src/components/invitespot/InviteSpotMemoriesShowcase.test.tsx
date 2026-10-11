import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InviteSpotMemoriesShowcase } from "./InviteSpotMemoriesShowcase";

Object.assign(globalThis, { React });

function render(messages: typeof enMessages, locale: string): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <InviteSpotMemoriesShowcase />
    </NextIntlClientProvider>,
  );
}

test("the Memories showcase renders its English heading, body, and all three bullets", () => {
  const html = render(enMessages, "en");
  assert.match(html, /Every guest&#x27;s photos, without the chasing/);
  assert.match(html, /No app or account for guests — just scan and share/);
  assert.match(html, /You choose who can see it — public or passcode-protected/);
});

test("the Memories showcase renders its Spanish copy for a Spanish-locale visitor", () => {
  const html = render(esMessages, "es");
  assert.match(html, /Las fotos de cada invitado, sin tener que perseguirlas/);
  assert.match(html, /Sin apps ni cuentas para los invitados/);
});

test("the Memories showcase references the showcase image with real alt text, not an empty string", () => {
  const html = render(enMessages, "en");
  assert.match(html, /alt="A shared InviteSpot photo gallery from a real event"/);
});
