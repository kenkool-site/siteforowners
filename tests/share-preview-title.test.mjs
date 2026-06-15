import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildSharePreviewTitle } from "../src/lib/share-preview-title.ts";

test("buildSharePreviewTitle leads with business name for pipe-separated seo titles", () => {
  assert.equal(
    buildSharePreviewTitle("Novara Beauty Luxe", {
      seoTitle: "Luxury Braiding Studio | Novara_Beauty Luxe NYC",
    }),
    "Novara Beauty Luxe — Luxury Braiding Studio",
  );
});

test("buildSharePreviewTitle keeps name-first titles unchanged", () => {
  assert.equal(
    buildSharePreviewTitle("Novara Beauty Luxe", {
      seoTitle: "Novara Beauty Luxe — Braiding as an Art Form",
    }),
    "Novara Beauty Luxe — Braiding as an Art Form",
  );
});

test("buildSharePreviewTitle falls back to hero headline", () => {
  assert.equal(
    buildSharePreviewTitle("Novara Beauty Luxe", {
      heroHeadline: "Braiding as an Art Form.",
    }),
    "Novara Beauty Luxe — Braiding as an Art Form.",
  );
});

test("tenant site generateMetadata uses share preview title for Open Graph", async () => {
  const page = await readFile("src/app/site/[slug]/page.tsx", "utf8");

  assert.match(page, /buildSharePreviewTitle/, "site page should build a share-specific title");
  assert.match(
    page,
    /openGraph:\s*\{[\s\S]*title:\s*shareTitle/,
    "Open Graph title should use the share preview title",
  );
  assert.match(
    page,
    /twitter:\s*\{[\s\S]*title:\s*shareTitle/,
    "Twitter title should use the share preview title",
  );
  assert.match(
    page,
    /title:\s*seoTitle/,
    "document title should keep the SEO title for search engines",
  );
});
