import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratedCopy } from "@/lib/ai/types";
import {
  buildHomeServicesHomepageAlternates,
  buildHomeServicesHomepageSeoFields,
  hasSpanishHomepageCopy,
} from "./homepage-metadata";

test("buildHomeServicesHomepageAlternates emits reciprocal hreflang URLs", () => {
  const result = buildHomeServicesHomepageAlternates(
    { subdomain: "greenline", custom_domain: null, preview_slug: "greenline" },
    "https://siteforowners.com",
    "es",
  );
  assert.equal(result.canonical, "https://greenline.siteforowners.com/es");
  assert.equal(result.languages?.en, "https://greenline.siteforowners.com/");
  assert.equal(result.languages?.es, "https://greenline.siteforowners.com/es");
  assert.equal(result.languages?.["x-default"], "https://greenline.siteforowners.com/");
});

test("hasSpanishHomepageCopy requires all Spanish homepage fields", () => {
  assert.equal(
    hasSpanishHomepageCopy({
      es: {
        hero_headline: "Titulo",
        hero_subheadline: "Subtitulo",
        seo_title: "SEO",
        seo_description: "Descripcion",
      },
    } as GeneratedCopy),
    true,
  );
  assert.equal(
    hasSpanishHomepageCopy({
      es: {
        hero_headline: "Titulo",
        hero_subheadline: "Subtitulo",
        seo_title: "SEO",
      },
    } as GeneratedCopy),
    false,
  );
});

test("buildHomeServicesHomepageSeoFields does not fall back to English for Spanish", () => {
  const result = buildHomeServicesHomepageSeoFields(
    "Greenline",
    {
      en: {
        seo_title: "English SEO",
        seo_description: "English description",
        hero_headline: "English headline",
        hero_subheadline: "English subheadline",
      },
      es: {
        seo_title: "SEO en espanol",
        seo_description: "Descripcion en espanol",
        hero_headline: "Titulo en espanol",
        hero_subheadline: "Subtitulo en espanol",
      },
    } as GeneratedCopy,
    "es",
  );
  assert.equal(result.title, "SEO en espanol");
  assert.equal(result.description, "Descripcion en espanol");
});
