import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FounderEventForm } from "./FounderEventForm";

Object.assign(globalThis, { React });

test("founder creation exposes an optional editable clean subdomain", () => {
  const html = renderToStaticMarkup(<FounderEventForm />);
  assert.match(html, /name="publicSubdomain"/);
  assert.match(html, /\.siteforowners\.com/);
  assert.match(html, /Generated from the event title/);
});
