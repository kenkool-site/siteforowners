import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialLinksPayload, normalizeSocialLink, type SocialPlatform } from "./social-links";

function profileUrl(platform: SocialPlatform, handle: string): string {
  const clean = handle.replace(/^@+/, "");
  switch (platform) {
    case "instagram":
      return `https://www.instagram.com/${clean}`;
    case "facebook":
      return `https://www.facebook.com/${clean}`;
    case "tiktok":
      return `https://www.tiktok.com/@${clean}`;
  }
}

test("normalizeSocialLink maps bare handles to the platform profile URL", () => {
  const cases: Array<{ input: string; platform: SocialPlatform }> = [
    { input: "studio.name", platform: "instagram" },
    { input: "@studio.name", platform: "instagram" },
    { input: "myuser", platform: "tiktok" },
    { input: "@myuser", platform: "tiktok" },
    { input: "MyPage", platform: "facebook" },
  ];

  for (const { input, platform } of cases) {
    assert.equal(normalizeSocialLink(input, platform), profileUrl(platform, input));
  }
});

test("normalizeSocialLink preserves full and scheme-less platform URLs", () => {
  assert.equal(
    normalizeSocialLink("https://www.instagram.com/studio.name", "instagram"),
    "https://www.instagram.com/studio.name",
  );
  assert.equal(
    normalizeSocialLink("instagram.com/studio.name", "instagram"),
    "https://instagram.com/studio.name",
  );
});

test("buildSocialLinksPayload normalizes each platform field independently", () => {
  const input = {
    instagram: "studio.name",
    facebook: "MyPage",
    tiktok: "myuser",
  };

  const out = buildSocialLinksPayload(input);
  assert.deepEqual(out, {
    instagram: profileUrl("instagram", input.instagram),
    facebook: profileUrl("facebook", input.facebook),
    tiktok: profileUrl("tiktok", input.tiktok),
  });
});
