import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { GuestMessageComposer } from "./GuestMessageComposer";

Object.assign(globalThis, { React });

function render(): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="America/New_York">
      <GuestMessageComposer
        eventId="event-1"
        eventName="Mercy & John"
        eventTitle="You're Invited"
        backHref="/invitations/manage/event-1"
        initialRecipientCounts={{ email: 8, sms: 5 }}
        initialTotalResponses={10}
        initialHistory={[]}
      />
    </NextIntlClientProvider>,
  );
}

test("the composer exposes a channel picker, template picker, and compose fields", () => {
  const html = render();
  for (const expected of ["Email", "Text message", "Start from a template", "Thank you", "Reminder", "Update", "Subject", "Message", "Send message"]) {
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
