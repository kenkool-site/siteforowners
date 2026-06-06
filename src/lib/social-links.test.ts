import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialLinksPayload, normalizeSocialLink } from "./social-links";

test("normalizeSocialLink turns bare Instagram handle into profile URL", () => {
  assert.equal(
    normalizeSocialLink("braids.by.roese", "instagram"),
    "https://www.instagram.com/braids.by.roese",
  );
  assert.equal(
    normalizeSocialLink("@braids.by.roese", "instagram"),
    "https://www.instagram.com/braids.by.roese",
  );
});

test("normalizeSocialLink turns bare TikTok handle into profile URL", () => {
  assert.equal(normalizeSocialLink("braidsbyroese", "tiktok"), "https://www.tiktok.com/@braidsbyroese");
  assert.equal(normalizeSocialLink("@braidsbyroese", "tiktok"), "https://www.tiktok.com/@braidsbyroese");
});

test("normalizeSocialLink turns bare Facebook handle into profile URL", () => {
  assert.equal(normalizeSocialLink("BraidsByRosee", "facebook"), "https://www.facebook.com/BraidsByRosee");
});

test("normalizeSocialLink preserves full and scheme-less platform URLs", () => {
  assert.equal(
    normalizeSocialLink("https://www.instagram.com/braids.by.roese", "instagram"),
    "https://www.instagram.com/braids.by.roese",
  );
  assert.equal(
    normalizeSocialLink("instagram.com/braids.by.roese", "instagram"),
    "https://instagram.com/braids.by.roese",
  );
});

test("buildSocialLinksPayload normalizes each platform field independently", () => {
  const out = buildSocialLinksPayload({
    instagram: "braids.by.roese",
    facebook: "BraidsByRosee",
    tiktok: "braidsbyroese",
  });
  assert.deepEqual(out, {
    instagram: "https://www.instagram.com/braids.by.roese",
    facebook: "https://www.facebook.com/BraidsByRosee",
    tiktok: "https://www.tiktok.com/@braidsbyroese",
  });
});
