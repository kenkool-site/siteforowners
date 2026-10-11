import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InviteSpotInvitesShowcase } from "./InviteSpotInvitesShowcase";
Object.assign(globalThis, { React });
function render(messages: typeof enMessages, locale: string) {
 return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><InviteSpotInvitesShowcase /></NextIntlClientProvider>);
}
test("invitation examples represent weddings, birthdays, and naming ceremonies",()=>{
 const html=render(enMessages,"en");
 for(const heading of ["Made for your kind of gathering.","Wedding","Birthday","Naming ceremony"]) assert.ok(html.includes(heading));
 assert.match(html,/Guest RSVPs · SMS &amp; email updates/);
});
test("invitation examples render Spanish copy",()=>{
 const html=render(esMessages,"es");
 for(const heading of ["Para tu tipo de celebración.","Boda","Cumpleaños","Ceremonia de nombre"]) assert.ok(html.includes(heading));
});
