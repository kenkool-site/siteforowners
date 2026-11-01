import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RequestSiteContent } from "./RequestSiteContent";

Object.assign(globalThis, { React });

test("request-site SMS consent is optional, unchecked, and links to privacy and terms", () => {
  const html = renderToStaticMarkup(<RequestSiteContent />);
  const checkbox = html.match(/<input[^>]*name="smsConsent"[^>]*>/)?.[0] ?? "";
  assert.match(checkbox, /type="checkbox"/);
  assert.equal(checkbox.includes("required"), false);
  assert.equal(checkbox.includes("checked"), false);
  assert.match(html, /Yes, text me about my free website preview from SiteForOwners/);
  assert.match(html, /Sí, envíame mensajes de texto sobre la vista previa gratuita/);
  assert.match(html, /href="\/privacy"/);
  assert.match(html, /href="\/terms"/);
  assert.match(html, />Privacy Policy</);
  assert.match(html, />Terms</);
});
