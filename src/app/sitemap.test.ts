import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitespotSitemap } from "./sitemap";

test("the sitemap lists the canonical invitespot.app homepage when requested on the invitespot.app host", () => {
  const entries = buildInvitespotSitemap("invitespot.app");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, "https://www.invitespot.app/");
});

test("the sitemap also recognizes the www host", () => {
  const entries = buildInvitespotSitemap("www.invitespot.app");
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, "https://www.invitespot.app/");
});

test("the sitemap is empty for any other host, so it never leaks onto siteforowners.com or a tenant domain", () => {
  assert.deepEqual(buildInvitespotSitemap("siteforowners.com"), []);
  assert.deepEqual(buildInvitespotSitemap("someclient.siteforowners.com"), []);
  assert.deepEqual(buildInvitespotSitemap("mariamhair.com"), []);
  assert.deepEqual(buildInvitespotSitemap(null), []);
});
