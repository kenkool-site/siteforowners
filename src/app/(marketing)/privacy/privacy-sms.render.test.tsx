import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import PrivacyPage from "./page";
import {
  PRIVACY_SMS_OPT_IN_EXCLUSION,
  PRIVACY_SMS_PREVIEW_COPY,
} from "@/lib/request-site-sms-consent";

Object.assign(globalThis, { React });

test("privacy policy includes the SMS preview section and sharing exclusion", () => {
  const html = renderToStaticMarkup(<PrivacyPage />);
  assert.match(html, /SMS \/ Text messaging/);
  assert.ok(html.includes(PRIVACY_SMS_PREVIEW_COPY.en));
  assert.ok(html.includes(PRIVACY_SMS_PREVIEW_COPY.es));
  assert.ok(html.includes(PRIVACY_SMS_OPT_IN_EXCLUSION));
  assert.ok(html.split(PRIVACY_SMS_OPT_IN_EXCLUSION).length >= 3);
});
