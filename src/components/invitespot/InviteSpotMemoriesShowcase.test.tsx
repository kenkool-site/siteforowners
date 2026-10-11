import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";
import { InviteSpotMemoriesShowcase } from "./InviteSpotMemoriesShowcase";
Object.assign(globalThis, { React });
function render(messages: typeof enMessages, locale: string) {
 return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC"><InviteSpotMemoriesShowcase /></NextIntlClientProvider>);
}
test("Memories explains guest sharing and includes navigable gallery photos",()=>{
 const html=render(enMessages,"en");
 assert.match(html,/Every guest’s photos, together/);
 assert.match(html,/No app download\. No guest account/);
 assert.match(html,/AI smart albums/);
 assert.match(html,/aria-label="View photo 6"/);
 assert.match(html,/Add photos/);
});
test("Memories renders Spanish copy and image labels",()=>{
 const html=render(esMessages,"es");
 assert.match(html,/Las fotos de todos, juntas/);
 assert.match(html,/Añadir fotos/);
 assert.match(html,/Foto de una celebración de boda/);
});
