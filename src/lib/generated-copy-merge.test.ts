import assert from "node:assert/strict";
import test from "node:test";
import { mergeGeneratedCopy } from "./generated-copy-merge";

test("mergeGeneratedCopy preserves omitted top-level keys", () => {
  const existing = {
    en: { hero_headline: "Hello" },
    social_links: { instagram: "https://instagram.com/a" },
    section_settings: { show_hours: true },
    home_services_config: { trust_points: [{ id: "a", label_en: "A", label_es: "A" }] },
  };

  const merged = mergeGeneratedCopy(existing, {
    en: { hero_subheadline: "Sub" },
  });

  assert.deepEqual(merged.social_links, existing.social_links);
  assert.deepEqual(merged.section_settings, existing.section_settings);
  assert.deepEqual(merged.home_services_config, existing.home_services_config);
  assert.deepEqual(merged.en, {
    hero_headline: "Hello",
    hero_subheadline: "Sub",
  });
});

test("mergeGeneratedCopy replaces keys only when explicitly provided", () => {
  const existing = {
    social_links: { instagram: "old" },
    section_settings: { show_hours: true },
    home_services_config: { coverage_summary_en: "Old" },
  };

  const merged = mergeGeneratedCopy(existing, {
    social_links: { facebook: "new" },
    home_services_config: { coverage_summary_en: "New" },
  });

  assert.deepEqual(merged.social_links, { facebook: "new" });
  assert.deepEqual(merged.section_settings, { show_hours: true });
  assert.deepEqual(merged.home_services_config, { coverage_summary_en: "New" });
});

test("mergeGeneratedCopy merges locale copy without dropping sibling locales", () => {
  const existing = {
    en: { hero_headline: "EN" },
    es: { hero_headline: "ES" },
  };

  const merged = mergeGeneratedCopy(existing, {
    es: { footer_tagline: "Pie" },
  });

  assert.deepEqual(merged.en, { hero_headline: "EN" });
  assert.deepEqual(merged.es, { hero_headline: "ES", footer_tagline: "Pie" });
});
