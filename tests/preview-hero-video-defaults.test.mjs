import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const businessTypes = ["salon", "barbershop", "restaurant", "nails", "braids"];

test("default hero video paths exist for every business type", async () => {
  const source = await readFile("src/lib/templates/default-hero-videos.ts", "utf8");
  for (const t of businessTypes) {
    assert.match(source, new RegExp(`\\b${t}:\\s*"/marketing/hero-defaults/${t}\\.mp4"`), `missing default path for ${t}`);
  }
  assert.match(source, /getDefaultHeroVideoUrl/, "should export resolver for previews");
});

test("generate-copy applies default hero video when customer omits one", async () => {
  const route = await readFile("src/app/api/generate-copy/route.ts", "utf8");
  assert.match(route, /getDefaultHeroVideoUrl/, "generate should use default vertical video");
  assert.match(route, /customerHeroVideo/, "generate should separate customer vs default video");
});

test("public preview hero video upload API mirrors admin sign-then-upload flow", async () => {
  const route = await readFile("src/app/api/upload-preview-hero-video/route.ts", "utf8");
  assert.match(route, /createSignedUploadUrl/, "preview upload should use signed URL");
  assert.doesNotMatch(route, /ADMIN_PASSWORD|admin_session/, "preview upload must not require admin session");
});
