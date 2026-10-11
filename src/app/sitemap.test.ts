import assert from "node:assert/strict";
import test from "node:test";
import sitemap from "./sitemap";

test("the sitemap lists the canonical invitespot.app homepage with the www host", () => {
  const entries = sitemap();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].url, "https://www.invitespot.app/");
});
