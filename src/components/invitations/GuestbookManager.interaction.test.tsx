import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { GuestbookManager } from "./GuestbookManager";

(globalThis as Record<string, unknown>).React = React;

test("guestbook manager exposes enablement and reversible moderation before permanent deletion", () => {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC"><GuestbookManager eventId="11111111-1111-4111-8111-111111111111" title="Mercy & John" initialEnabled initialComments={[{ id: "22222222-2222-4222-8222-222222222222", guestName: "Ada", body: "Congratulations!", isHidden: false, createdAt: "2026-09-17T12:00:00.000Z", updatedAt: "2026-09-17T12:00:00.000Z" }]} backHref="/invitations/manage/event" /></NextIntlClientProvider>);
  assert.match(html, /Hide Comment Wall/);
  assert.match(html, /Congratulations!/);
  assert.match(html, />Hide</);
  assert.match(html, /Delete permanently/);
});
