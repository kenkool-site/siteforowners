import assert from "node:assert/strict";
import test from "node:test";
import robots from "./robots";

test("robots.txt allows all crawlers and points at the invitespot.app sitemap", () => {
  const result = robots();
  assert.deepEqual(result.rules, { userAgent: "*", allow: "/" });
  assert.equal(result.sitemap, "https://www.invitespot.app/sitemap.xml");
});
