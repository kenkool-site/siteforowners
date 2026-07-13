import assert from "node:assert/strict";
import test from "node:test";
import { parseHomeServicesConfig, type HomeServicesConfig } from "./types";
import { collectMissingTranslations, applyTranslations } from "./translate-fields";
import type { EditorDraft } from "@/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor";

function localeCopy(overrides: Partial<EditorDraft["generated_copy"]["en"]> = {}) {
  return {
    hero_headline: "",
    hero_subheadline: "",
    about_paragraphs: [] as string[],
    seo_title: "",
    seo_description: "",
    footer_tagline: "",
    google_business_description: "",
    service_descriptions: {} as Record<string, string>,
    ...overrides,
  };
}

function buildDraft(): EditorDraft {
  const config: HomeServicesConfig = {
    ...parseHomeServicesConfig({}),
    trust_points: [{ id: "t1", label_en: "Licensed & insured", label_es: "" }],
    why_us_points: [
      { id: "w1", title_en: "Fast quotes", title_es: "", body_en: "Same-day answers", body_es: "" },
    ],
    process_steps: [
      { id: "p1", title_en: "Call us", body_en: "We chat", title_es: "", body_es: "" },
    ],
    gallery_projects: [{ id: "g1", image: "https://example.com/i.jpg", caption_en: "New lawn" }],
    section_copy: {
      services: {
        eyebrow_en: "What we do", title_en: "Services", intro_en: "",
        eyebrow_es: "", title_es: "Servicios", intro_es: "",
      },
    },
    coverage_summary_en: "Serving South Jersey",
    coverage_summary_es: "",
  };
  return {
    business_name: "Blue Valley",
    phone: "",
    color_theme: "home_services_neighborhood" as EditorDraft["color_theme"],
    services: [
      { name: "Lawn Mowing", client_id: "svc-1", price: "" },
      { name: "No Id Service", price: "" },
    ],
    images: [],
    hero_video_url: null,
    gallery_video_url: null,
    gallery_video_title: "",
    about_image_url: null,
    generated_copy: {
      en: localeCopy({
        hero_headline: "Your yard, done right",
        about_paragraphs: ["We are local.", "We are fast."],
        service_descriptions: { "svc-1": "Weekly mowing and edging." },
      }),
      es: localeCopy({
        seo_title: "ya traducido",
        about_paragraphs: ["Somos locales."],
      }),
      section_settings: {},
    },
    home_services_config: config,
  };
}

test("collectMissingTranslations finds every missing es field and only those", () => {
  const texts = collectMissingTranslations(buildDraft(), "en", "es");
  assert.deepEqual(Object.keys(texts).sort(), [
    "cap.g1",
    "copy.about_paragraphs.1",
    "copy.hero_headline",
    "coverage",
    "desc.svc-1",
    "proc.p1.body",
    "proc.p1.title",
    "sc.services.eyebrow",
    "trust.t1.label",
    "why.w1.body",
    "why.w1.title",
  ]);
  assert.equal(texts["copy.hero_headline"], "Your yard, done right");
  assert.equal(texts["copy.about_paragraphs.1"], "We are fast.");
  // sc.services.title excluded (es already filled); sc.services.intro excluded (source empty);
  // seo_title excluded (es filled); no-client_id service excluded.
});

test("collectMissingTranslations works in the es -> en direction", () => {
  const draft = buildDraft();
  const texts = collectMissingTranslations(draft, "es", "en");
  assert.deepEqual(Object.keys(texts).sort(), ["copy.seo_title"]);
  assert.equal(texts["copy.seo_title"], "ya traducido");
});

test("applyTranslations writes every key category back immutably", () => {
  const draft = buildDraft();
  const next = applyTranslations(draft, "es", {
    "copy.hero_headline": "Tu jardín, bien hecho",
    "copy.about_paragraphs.1": "Somos rápidos.",
    "desc.svc-1": "Corte y bordes semanales.",
    "sc.services.eyebrow": "Lo que hacemos",
    "trust.t1.label": "Con licencia y seguro",
    "why.w1.title": "Cotizaciones rápidas",
    "why.w1.body": "Respuestas el mismo día",
    "proc.p1.title": "Llámenos",
    "proc.p1.body": "Conversamos",
    "cap.g1": "Césped nuevo",
    coverage: "Sirviendo el sur de Jersey",
    "unknown.key": "ignored",
    "trust.missing-id.label": "ignored",
  });

  assert.equal(next.generated_copy.es.hero_headline, "Tu jardín, bien hecho");
  assert.deepEqual(next.generated_copy.es.about_paragraphs, ["Somos locales.", "Somos rápidos."]);
  assert.equal(next.generated_copy.es.service_descriptions["svc-1"], "Corte y bordes semanales.");
  assert.equal(next.home_services_config.section_copy.services?.eyebrow_es, "Lo que hacemos");
  assert.equal(next.home_services_config.trust_points[0]?.label_es, "Con licencia y seguro");
  assert.equal(next.home_services_config.why_us_points[0]?.title_es, "Cotizaciones rápidas");
  assert.equal(next.home_services_config.why_us_points[0]?.body_es, "Respuestas el mismo día");
  assert.equal(next.home_services_config.process_steps[0]?.title_es, "Llámenos");
  assert.equal(next.home_services_config.process_steps[0]?.body_es, "Conversamos");
  assert.equal(next.home_services_config.gallery_projects[0]?.caption_es, "Césped nuevo");
  assert.equal(next.home_services_config.coverage_summary_es, "Sirviendo el sur de Jersey");

  // immutability: original draft untouched
  assert.equal(draft.generated_copy.es.hero_headline, "");
  assert.equal(draft.home_services_config.trust_points[0]?.label_es, "");
  assert.deepEqual(draft.generated_copy.es.about_paragraphs, ["Somos locales."]);
});

test("applyTranslations pads about_paragraphs with empty strings when extending", () => {
  const draft = buildDraft();
  const next = applyTranslations(draft, "es", { "copy.about_paragraphs.3": "Cuarto" });
  assert.deepEqual(next.generated_copy.es.about_paragraphs, ["Somos locales.", "", "", "Cuarto"]);
});

test("applyTranslations ignores empty values and absurd indexes", () => {
  const draft = buildDraft();
  const next = applyTranslations(draft, "es", {
    "copy.hero_headline": "   ",
    "copy.about_paragraphs.9999": "nope",
    "copy.about_paragraphs.x": "nope",
  });
  assert.equal(next.generated_copy.es.hero_headline, "");
  assert.deepEqual(next.generated_copy.es.about_paragraphs, ["Somos locales."]);
});
