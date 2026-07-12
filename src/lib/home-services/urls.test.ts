import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSmsHref,
  buildTelHref,
  buildWhatsAppHref,
  homepagePath,
} from "./urls";

test("phone action URLs normalize a North American number", () => {
  assert.equal(buildTelHref("(832) 555-0147"), "tel:+18325550147");
  assert.equal(buildSmsHref("(832) 555-0147"), "sms:+18325550147");
  assert.equal(buildWhatsAppHref("(832) 555-0147"), "https://wa.me/18325550147");
});

test("invalid numbers do not create public actions", () => {
  assert.equal(buildTelHref("123"), null);
  assert.equal(buildWhatsAppHref(""), null);
});

test("homepage paths are crawlable", () => {
  assert.equal(homepagePath("en"), "/");
  assert.equal(homepagePath("es"), "/es");
});
