import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("preview generation accepts and persists social links", async () => {
  const wizard = await readFile("src/app/(marketing)/preview/page.tsx", "utf8");
  const route = await readFile("src/app/api/generate-copy/route.ts", "utf8");

  assert.match(wizard, /instagramUrl/, "preview wizard should collect Instagram");
  assert.match(wizard, /facebookUrl/, "preview wizard should collect Facebook");
  assert.match(wizard, /tiktokUrl/, "preview wizard should collect TikTok");
  assert.match(wizard, /social_links:\s*buildSocialLinksPayload/, "wizard should send normalized social links");
  assert.match(route, /social_links/, "generate-copy should accept social links");
  assert.match(route, /resolvedSocialLinks \? \{ social_links: resolvedSocialLinks \} : \{\}/, "generate-copy should persist social links");
});

test("site editor can update social links", async () => {
  const editor = await readFile("src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx", "utf8");
  const route = await readFile("src/app/api/update-site/route.ts", "utf8");

  assert.match(editor, /instagramUrl/, "SiteEditor should expose Instagram");
  assert.match(editor, /facebookUrl/, "SiteEditor should expose Facebook");
  assert.match(editor, /tiktokUrl/, "SiteEditor should expose TikTok");
  assert.match(editor, /social_links:\s*buildSocialLinksPayload/, "SiteEditor should save normalized social links");
  assert.match(route, /generatedCopyUpdates\.social_links/, "update-site should merge social links");
});

test("social link normalizer maps bare handles to platform URLs", async () => {
  const { buildSocialLinksPayload, normalizeSocialLink } = await import("../src/lib/social-links.ts");

  assert.equal(
    normalizeSocialLink("braids.by.roese", "instagram"),
    "https://www.instagram.com/braids.by.roese",
  );
  assert.equal(normalizeSocialLink("braidsbyroese", "tiktok"), "https://www.tiktok.com/@braidsbyroese");
  assert.equal(normalizeSocialLink("BraidsByRosee", "facebook"), "https://www.facebook.com/BraidsByRosee");

  const out = buildSocialLinksPayload({
    instagram: "braids.by.roese",
    tiktok: "@braidsbyroese",
  });
  assert.deepEqual(out, {
    instagram: "https://www.instagram.com/braids.by.roese",
    tiktok: "https://www.tiktok.com/@braidsbyroese",
  });
});

test("template social links render only populated platforms", async () => {
  const social = await readFile("src/components/templates/TemplateSocialLinks.tsx", "utf8");
  const orchestrator = await readFile("src/components/templates/TemplateOrchestrator.tsx", "utf8");
  const footer = await readFile("src/components/templates/TemplateFooter.tsx", "utf8");

  assert.match(social, /filter\(\(item\) => item\.href\)/, "social component should filter empty links");
  assert.match(social, /Instagram/, "social component should include Instagram icon");
  assert.match(social, /Facebook/, "social component should include Facebook icon");
  assert.match(social, /TikTok/, "social component should include TikTok icon");
  assert.match(orchestrator, /heroSocialSection/, "orchestrator should render social links after hero");
  assert.match(footer, /TemplateSocialLinks/, "footer should render social links");
});
