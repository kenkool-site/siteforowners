import assert from "node:assert/strict";
import test from "node:test";
import { buildInvitespotRobots } from "./robots";

test("robots.txt allows all crawlers and points at the invitespot.app sitemap when requested on the invitespot.app host", () => {
  const result = buildInvitespotRobots("invitespot.app");
  assert.deepEqual(result.rules, { userAgent: "*", allow: "/" });
  assert.equal(result.sitemap, "https://www.invitespot.app/sitemap.xml");
});

test("robots.txt advertises the SiteForOwners sitemap on its own domain", () => {
  const result = buildInvitespotRobots("siteforowners.com");
  assert.deepEqual(result.rules, { userAgent: "*", allow: "/" });
  assert.equal(result.sitemap, "https://www.siteforowners.com/sitemap.xml");
});
