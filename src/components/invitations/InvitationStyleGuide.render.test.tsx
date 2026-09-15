import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import { InvitationStyleGuide } from "./InvitationStyleGuide";

(globalThis as Record<string, unknown>).React = React;

test("style guide renders authored guidance and accessible labeled swatches", () => {
  const html = renderToStaticMarkup(<NextIntlClientProvider locale="en" messages={enMessages}>
    <InvitationStyleGuide guide={{ note: "Glamorous fascinators", colors: [{ name: "Sage", color: "#AAB39A" }] }} titleClass="font-serif" accent="#704F3A" surface="#FFFDF8" />
  </NextIntlClientProvider>);
  assert.match(html, /Style guide/i);
  assert.match(html, /Glamorous fascinators/);
  assert.match(html, /Sage/);
  assert.match(html, /aria-label="Sage: #AAB39A"/);
});
