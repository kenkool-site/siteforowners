import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { RsvpForm } from "./RsvpForm";

Object.assign(globalThis, { React });

function render(locale: "en" | "es" = "en", allowCreate = true): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={locale === "es" ? esMessages : enMessages} timeZone="UTC">
      <RsvpForm slug="mia-and-lee" allowCreate={allowCreate} showPublicRsvpCount />
    </NextIntlClientProvider>,
  );
}

test("the localized RSVP form exposes every guest field with accessible labels", () => {
  const html = render();
  for (const expected of [
    "Your name",
    "Yes, I’ll attend",
    "No, I can’t attend",
    "Total people",
    "Additional guest names",
    "Email",
    "Phone",
    "Dietary or accessibility notes",
    "Message for the host",
  ]) assert.match(html, new RegExp(expected));
  assert.match(html, /aria-describedby="rsvp-contact-help"/);
  assert.match(html, /min-h-11/);
  assert.match(html, /motion-reduce:/);
});

test("Spanish copy is translated while the event slug remains unchanged", () => {
  const html = render("es");
  assert.match(html, /Tu nombre/);
  assert.match(html, /Sí, asistiré/);
  assert.match(html, /mia-and-lee/);
});

test("a closed invitation directs changes to the host without exposing a create form", () => {
  const html = render("en", false);
  assert.match(html, /host is no longer accepting new responses/i);
  assert.match(html, /contact the host/i);
  assert.doesNotMatch(html, /name="primaryName"/);
});
