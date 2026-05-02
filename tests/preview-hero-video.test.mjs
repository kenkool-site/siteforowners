import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("preview flow persists hero video URL (customer URL or vertical default)", async () => {
  const route = await readFile("src/app/api/generate-copy/route.ts", "utf8");
  assert.match(route, /hero_video_url/, "generate-copy should accept hero_video_url");
  assert.match(route, /customerHeroVideo/, "generate should separate customer-provided video");
  assert.match(route, /getDefaultHeroVideoUrl/, "generate should fall back to default vertical video");
  assert.match(
    route,
    /\.\.\.\(resolvedHeroVideo \? \{ hero_video_url: resolvedHeroVideo \} : \{\}\)/,
    "insert row should set resolved hero_video_url when present",
  );
});

test("preview edit API returns hero video URL", async () => {
  const route = await readFile("src/app/api/preview-data/route.ts", "utf8");
  assert.match(route, /hero_video_url/, "preview-data should expose hero_video_url");
});

test("regenerate resolves hero video from stored preview or vertical default", async () => {
  const route = await readFile("src/app/api/regenerate-copy/route.ts", "utf8");
  assert.match(route, /resolvedRegenHeroVideo/, "regenerate should resolve hero video");
  assert.match(route, /getDefaultHeroVideoUrl/, "regenerate should fall back to default when unset");
});

test("marketing preview wizard can upload hero video via public signed URL flow", async () => {
  const page = await readFile("src/app/(marketing)/preview/page.tsx", "utf8");
  assert.match(page, /heroVideoUrl/, "wizard should track hero video URL");
  assert.match(page, /hero_video_url:\s*heroVideoUrl/, "generate payload should include hero video");
  assert.match(page, /upload-preview-hero-video/, "wizard should use public hero upload endpoint");
});
