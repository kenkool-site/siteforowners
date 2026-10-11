import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitespotSitemap } from "./sitemap";

test("the sitemap lists the canonical invitespot.app homepage when requested on the invitespot.app host", () => {
  const entries = buildInvitespotSitemap("invitespot.app");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].url, "https://www.invitespot.app/");
});

test("the sitemap also recognizes the www host", () => {
  const entries = buildInvitespotSitemap("www.invitespot.app");
  assert.equal(entries.length, 2);
  assert.equal(entries[0].url, "https://www.invitespot.app/");
});

test("the sitemap is empty for any other host, so it never leaks onto siteforowners.com or a tenant domain", () => {
  assert.deepEqual(buildInvitespotSitemap("siteforowners.com"), []);
  assert.deepEqual(buildInvitespotSitemap("someclient.siteforowners.com"), []);
  assert.deepEqual(buildInvitespotSitemap("mariamhair.com"), []);
  assert.deepEqual(buildInvitespotSitemap(null), []);
});

test("sitemap includes Spanish alternates and a stable content modification date", () => {
  const entries = buildInvitespotSitemap("www.invitespot.app");
  assert.equal(entries[1]?.url, "https://www.invitespot.app/?lang=es");
  assert.equal(entries[0].lastModified, "2026-10-11");
  assert.deepEqual(entries[0].alternates?.languages, { en: "https://www.invitespot.app/", es: "https://www.invitespot.app/?lang=es", "x-default": "https://www.invitespot.app/" });
});
