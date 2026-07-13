# Home-Services AI Copy Translation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A founder-editor button that AI-fills missing translations for all bilingual home-services copy, plus an English fallback for untranslated service descriptions on the live site.

**Architecture:** A copy-agnostic founder-gated route (`POST /api/admin/translate-copy`) translates a flat `{key: text}` map with one Claude Haiku call. A pure lib (`translate-fields.ts`) owns the editor-draft ⇄ flat-map key scheme (collect missing / apply back). The editor button wires the two. A tiny display helper merges locale description maps for the live-site fallback.

**Tech Stack:** Next.js 14 App Router, TypeScript strict, `@anthropic-ai/sdk` (`new Anthropic()`, `ANTHROPIC_API_KEY`), model `claude-haiku-4-5-20251001`, node:test via `npx tsx --test`.

**Spec:** `docs/superpowers/specs/2026-07-12-home-services-ai-translation-design.md`

## Global Constraints

- TypeScript strict — no `any` (narrow `unknown`; `as Record<string, unknown>` style casts are fine).
- Tests run with `npx tsx --test <file>`; TDD for lib code. NOTE: node's test runner globs CLI args — never place a test file under a `[tenantId]` path segment (it silently never runs).
- Route auth: `admin_session` cookie must equal `process.env.ADMIN_PASSWORD` (same as `src/app/api/suggest-theme-colors/route.ts`); otherwise 401. No rate limiting.
- Caps: max 150 fields, max 20,000 total source characters per request.
- Model `claude-haiku-4-5-20251001`, `max_tokens: 4000`, `export const maxDuration = 60`.
- Editor button label: "Translate missing fields with AI" (admin UI is English-only; the bilingual next-intl rule applies to client-facing strings only).
- Conventional commits; continue on branch `fix/home-services-gallery-fallback-and-areas`; quote paths containing parens/brackets in git commands.
- Useful context: `parseHomeServicesConfig` silently DROPS trust/why-us rows missing either language at save time — translating in the editor before save is what makes those rows survive. No code change needed for this; do not "fix" the parser in this plan.

---

### Task 1: Live-site description fallback

**Files:**
- Modify: `src/lib/home-services/display.ts` (append)
- Modify: `src/components/templates/home-services/HomeServicesTemplate.tsx` (~lines 54-55 `copy` const, ~line 113 `serviceDescriptions` prop)
- Test: `src/lib/home-services/display.test.ts` (append)

**Interfaces:**
- Produces: `mergeDescriptionsWithFallback(primary: Record<string, string> | undefined, fallback: Record<string, string> | undefined): Record<string, string>`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/home-services/display.test.ts` (it already imports `assert`, `test`, and functions from `./display` — extend the import):

```ts
test("mergeDescriptionsWithFallback prefers primary values per key", () => {
  assert.deepEqual(
    mergeDescriptionsWithFallback({ a: "es-A" }, { a: "en-A", b: "en-B" }),
    { a: "es-A", b: "en-B" },
  );
});

test("mergeDescriptionsWithFallback ignores empty primary values", () => {
  assert.deepEqual(
    mergeDescriptionsWithFallback({ a: "", b: "  " }, { a: "en-A", b: "en-B" }),
    { a: "en-A", b: "en-B" },
  );
});

test("mergeDescriptionsWithFallback tolerates missing maps", () => {
  assert.deepEqual(mergeDescriptionsWithFallback(undefined, { a: "en-A" }), { a: "en-A" });
  assert.deepEqual(mergeDescriptionsWithFallback({ a: "es-A" }, undefined), { a: "es-A" });
  assert.deepEqual(mergeDescriptionsWithFallback(undefined, undefined), {});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/lib/home-services/display.test.ts`
Expected: the three new tests FAIL (`mergeDescriptionsWithFallback` is not exported).

- [ ] **Step 3: Implement the helper**

Append to `src/lib/home-services/display.ts`:

```ts
/**
 * Locale fallback for service descriptions: fallback entries first, overlaid
 * by primary entries with non-empty values — an empty Spanish value must not
 * mask the English fallback.
 */
export function mergeDescriptionsWithFallback(
  primary: Record<string, string> | undefined,
  fallback: Record<string, string> | undefined,
): Record<string, string> {
  const merged: Record<string, string> = { ...(fallback ?? {}) };
  for (const [key, value] of Object.entries(primary ?? {})) {
    if (typeof value === "string" && value.trim() !== "") merged[key] = value;
  }
  return merged;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/lib/home-services/display.test.ts`
Expected: PASS (all tests).

- [ ] **Step 5: Wire into the template**

In `src/components/templates/home-services/HomeServicesTemplate.tsx`, extend the display import:

```ts
import { galleryFallbackPhotos, hasProjectMedia, mergeDescriptionsWithFallback } from "@/lib/home-services/display";
```

Below the existing `const copy = data.generated_copy?.[locale];` add:

```ts
const fallbackLocaleCopy = data.generated_copy?.[locale === "es" ? "en" : "es"];
const serviceDescriptions = mergeDescriptionsWithFallback(
  copy?.service_descriptions,
  fallbackLocaleCopy?.service_descriptions,
);
```

Change the `HomeServicesServices` prop from `serviceDescriptions={copy?.service_descriptions ?? {}}` to `serviceDescriptions={serviceDescriptions}`.

- [ ] **Step 6: Verify types and commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add src/lib/home-services/display.ts src/lib/home-services/display.test.ts src/components/templates/home-services/HomeServicesTemplate.tsx
git commit -m "feat(home-services): fall back to English service descriptions on the Spanish site"
```

---

### Task 2: translate-fields collect/apply lib

**Files:**
- Modify: `src/lib/home-services/types.ts` (line ~104: export the section-key list)
- Create: `src/lib/home-services/translate-fields.ts`
- Test: `src/lib/home-services/translate-fields.test.ts`

**Interfaces:**
- Consumes: `EditorDraft` (type-only) from `@/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor`; `HomeServicesConfig`, `HomeServicesSectionKey`, `parseHomeServicesConfig` from `./types`.
- Produces:
  - `HOME_SERVICES_SECTION_KEYS: HomeServicesSectionKey[]` (exported from `types.ts`)
  - `type TranslateLocale = "en" | "es"`
  - `collectMissingTranslations(draft: EditorDraft, from: TranslateLocale, to: TranslateLocale): Record<string, string>`
  - `applyTranslations(draft: EditorDraft, to: TranslateLocale, translations: Record<string, string>): EditorDraft`
- Key scheme (Task 4 relies on it only via these two functions): `copy.<field>`, `copy.about_paragraphs.<i>`, `desc.<client_id>`, `sc.<sectionKey>.<eyebrow|title|intro>`, `trust.<id>.label`, `why.<id>.<title|body>`, `proc.<id>.<title|body>`, `cap.<projectId>`, `coverage`.

- [ ] **Step 1: Export the section-key list**

In `src/lib/home-services/types.ts` line ~104, change:

```ts
const SECTION_KEYS: HomeServicesSectionKey[] = [
```

to:

```ts
export const HOME_SERVICES_SECTION_KEYS: HomeServicesSectionKey[] = [
```

and update the file's internal references (`grep -n "SECTION_KEYS" src/lib/home-services/types.ts`) from `SECTION_KEYS` to `HOME_SERVICES_SECTION_KEYS`. Run `npx tsc --noEmit` — clean.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/home-services/translate-fields.test.ts`:

```ts
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
```

- [ ] **Step 3: Run to verify failure**

Run: `npx tsx --test src/lib/home-services/translate-fields.test.ts`
Expected: FAIL — module `./translate-fields` does not exist.

- [ ] **Step 4: Implement the lib**

Create `src/lib/home-services/translate-fields.ts`:

```ts
import {
  HOME_SERVICES_SECTION_KEYS,
  type HomeServicesSectionKey,
} from "./types";
import type { EditorDraft } from "@/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor";

/**
 * Draft ⇄ flat-map bridge for the "Translate missing fields with AI" button.
 * Key scheme: copy.<field> | copy.about_paragraphs.<i> | desc.<client_id> |
 * sc.<section>.<eyebrow|title|intro> | trust.<id>.label | why.<id>.<title|body> |
 * proc.<id>.<title|body> | cap.<projectId> | coverage
 * Service-area names are deliberately excluded (proper nouns).
 */

export type TranslateLocale = "en" | "es";

const COPY_FIELDS = [
  "hero_headline",
  "hero_subheadline",
  "seo_title",
  "seo_description",
  "footer_tagline",
  "google_business_description",
] as const;
type CopyField = (typeof COPY_FIELDS)[number];

const SECTION_PARTS = ["eyebrow", "title", "intro"] as const;
const MAX_PARAGRAPH_INDEX = 50;

const filled = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "";

export function collectMissingTranslations(
  draft: EditorDraft,
  from: TranslateLocale,
  to: TranslateLocale,
): Record<string, string> {
  const texts: Record<string, string> = {};
  const src = draft.generated_copy[from];
  const dst = draft.generated_copy[to];

  for (const field of COPY_FIELDS) {
    if (filled(src[field]) && !filled(dst[field])) texts[`copy.${field}`] = src[field];
  }
  src.about_paragraphs.forEach((paragraph, index) => {
    if (filled(paragraph) && !filled(dst.about_paragraphs[index])) {
      texts[`copy.about_paragraphs.${index}`] = paragraph;
    }
  });
  for (const service of draft.services) {
    const id = service.client_id;
    if (!id) continue;
    const source = src.service_descriptions[id];
    if (filled(source) && !filled(dst.service_descriptions[id])) texts[`desc.${id}`] = source;
  }

  const config = draft.home_services_config;
  for (const key of HOME_SERVICES_SECTION_KEYS) {
    const section = config.section_copy[key];
    if (!section) continue;
    for (const part of SECTION_PARTS) {
      const source = section[`${part}_${from}`];
      if (filled(source) && !filled(section[`${part}_${to}`])) {
        texts[`sc.${key}.${part}`] = source;
      }
    }
  }
  for (const point of config.trust_points) {
    if (filled(point[`label_${from}`]) && !filled(point[`label_${to}`])) {
      texts[`trust.${point.id}.label`] = point[`label_${from}`];
    }
  }
  for (const point of config.why_us_points) {
    if (filled(point[`title_${from}`]) && !filled(point[`title_${to}`])) {
      texts[`why.${point.id}.title`] = point[`title_${from}`];
    }
    const body = point[`body_${from}`];
    if (filled(body) && !filled(point[`body_${to}`])) texts[`why.${point.id}.body`] = body;
  }
  for (const step of config.process_steps) {
    if (filled(step[`title_${from}`]) && !filled(step[`title_${to}`])) {
      texts[`proc.${step.id}.title`] = step[`title_${from}`];
    }
    if (filled(step[`body_${from}`]) && !filled(step[`body_${to}`])) {
      texts[`proc.${step.id}.body`] = step[`body_${from}`];
    }
  }
  for (const project of config.gallery_projects) {
    const source = project[`caption_${from}`];
    if (filled(source) && !filled(project[`caption_${to}`])) texts[`cap.${project.id}`] = source;
  }
  const coverageSource = config[`coverage_summary_${from}`];
  if (filled(coverageSource) && !filled(config[`coverage_summary_${to}`])) {
    texts["coverage"] = coverageSource;
  }

  return texts;
}

export function applyTranslations(
  draft: EditorDraft,
  to: TranslateLocale,
  translations: Record<string, string>,
): EditorDraft {
  const next: EditorDraft = {
    ...draft,
    generated_copy: {
      ...draft.generated_copy,
      [to]: {
        ...draft.generated_copy[to],
        about_paragraphs: [...draft.generated_copy[to].about_paragraphs],
        service_descriptions: { ...draft.generated_copy[to].service_descriptions },
      },
    },
    home_services_config: {
      ...draft.home_services_config,
      section_copy: { ...draft.home_services_config.section_copy },
      trust_points: draft.home_services_config.trust_points.map((p) => ({ ...p })),
      why_us_points: draft.home_services_config.why_us_points.map((p) => ({ ...p })),
      process_steps: draft.home_services_config.process_steps.map((p) => ({ ...p })),
      gallery_projects: draft.home_services_config.gallery_projects.map((p) => ({ ...p })),
    },
  };
  const dst = next.generated_copy[to];
  const config = next.home_services_config;

  for (const [key, value] of Object.entries(translations)) {
    if (!filled(value)) continue;
    const parts = key.split(".");
    const head = parts[0];

    if (head === "copy" && parts.length === 2 && (COPY_FIELDS as readonly string[]).includes(parts[1]!)) {
      dst[parts[1] as CopyField] = value;
    } else if (head === "copy" && parts[1] === "about_paragraphs" && parts.length === 3) {
      const index = Number(parts[2]);
      if (!Number.isInteger(index) || index < 0 || index > MAX_PARAGRAPH_INDEX) continue;
      while (dst.about_paragraphs.length <= index) dst.about_paragraphs.push("");
      dst.about_paragraphs[index] = value;
    } else if (head === "desc" && parts.length === 2 && parts[1]) {
      dst.service_descriptions[parts[1]] = value;
    } else if (head === "sc" && parts.length === 3) {
      const sectionKey = parts[1] as HomeServicesSectionKey;
      const part = parts[2];
      if (!HOME_SERVICES_SECTION_KEYS.includes(sectionKey)) continue;
      if (part !== "eyebrow" && part !== "title" && part !== "intro") continue;
      const section = { ...(config.section_copy[sectionKey] ?? {}) };
      section[`${part}_${to}`] = value;
      config.section_copy[sectionKey] = section;
    } else if (head === "trust" && parts.length === 3 && parts[2] === "label") {
      const point = config.trust_points.find((p) => p.id === parts[1]);
      if (point) point[`label_${to}`] = value;
    } else if (head === "why" && parts.length === 3 && (parts[2] === "title" || parts[2] === "body")) {
      const point = config.why_us_points.find((p) => p.id === parts[1]);
      if (point) point[`${parts[2]}_${to}`] = value;
    } else if (head === "proc" && parts.length === 3 && (parts[2] === "title" || parts[2] === "body")) {
      const step = config.process_steps.find((p) => p.id === parts[1]);
      if (step) step[`${parts[2]}_${to}`] = value;
    } else if (head === "cap" && parts.length === 2) {
      const project = config.gallery_projects.find((p) => p.id === parts[1]);
      if (project) project[`caption_${to}`] = value;
    } else if (key === "coverage") {
      config[`coverage_summary_${to}`] = value;
    }
  }

  return next;
}
```

- [ ] **Step 5: Run to verify pass**

Run: `npx tsx --test src/lib/home-services/translate-fields.test.ts`
Expected: PASS (5 tests). Also run `npx tsc --noEmit` — clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/home-services/types.ts src/lib/home-services/translate-fields.ts src/lib/home-services/translate-fields.test.ts
git commit -m "feat(home-services): collect/apply lib for missing-translation fields"
```

---

### Task 3: translate-copy API route

**Files:**
- Create: `src/lib/ai/translate-copy.ts`
- Create: `src/app/api/admin/translate-copy/route.ts`
- Test: `src/lib/ai/translate-copy.test.ts`

**Interfaces:**
- Produces (lib): `MAX_TRANSLATE_FIELDS = 150`, `MAX_TRANSLATE_CHARS = 20000`, `type TranslateCopyRequest = { from: "en" | "es"; to: "en" | "es"; texts: Record<string, string> }`, `parseTranslateCopyRequest(body: unknown): { ok: true; value: TranslateCopyRequest } | { ok: false; error: string }`, `filterTranslations(input: Record<string, string>, raw: unknown): Record<string, string>`.
- Produces (route): `POST /api/admin/translate-copy` — request `{ from, to, texts }`; 200 `{ success: true, translations: Record<string, string> }`; 401/400/502 `{ error: string }`. Task 4 calls this.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ai/translate-copy.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTranslateCopyRequest,
  filterTranslations,
  MAX_TRANSLATE_FIELDS,
  MAX_TRANSLATE_CHARS,
} from "./translate-copy";

test("parseTranslateCopyRequest accepts a valid body", () => {
  const result = parseTranslateCopyRequest({ from: "en", to: "es", texts: { a: "Hello" } });
  assert.deepEqual(result, { ok: true, value: { from: "en", to: "es", texts: { a: "Hello" } } });
});

test("parseTranslateCopyRequest rejects bad locales, same locales, and bad shapes", () => {
  assert.equal(parseTranslateCopyRequest(null).ok, false);
  assert.equal(parseTranslateCopyRequest([]).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "fr", to: "es", texts: { a: "x" } }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "en", texts: { a: "x" } }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: [] }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: {} }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: { a: "" } }).ok, false);
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: { a: 3 } }).ok, false);
});

test("parseTranslateCopyRequest enforces the field and character caps", () => {
  const many = Object.fromEntries(
    Array.from({ length: MAX_TRANSLATE_FIELDS + 1 }, (_, i) => [`k${i}`, "x"]),
  );
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: many }).ok, false);
  const big = { a: "x".repeat(MAX_TRANSLATE_CHARS + 1) };
  assert.equal(parseTranslateCopyRequest({ from: "en", to: "es", texts: big }).ok, false);
});

test("filterTranslations keeps only known keys with non-empty string values", () => {
  const input = { a: "one", b: "two" };
  assert.deepEqual(
    filterTranslations(input, { a: "uno", b: "", c: "extra", d: 4 }),
    { a: "uno" },
  );
  assert.deepEqual(filterTranslations(input, null), {});
  assert.deepEqual(filterTranslations(input, "nope"), {});
  assert.deepEqual(filterTranslations(input, ["uno"]), {});
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx tsx --test src/lib/ai/translate-copy.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the lib**

Create `src/lib/ai/translate-copy.ts`:

```ts
/** Request validation + response filtering for POST /api/admin/translate-copy. */

export const MAX_TRANSLATE_FIELDS = 150;
export const MAX_TRANSLATE_CHARS = 20000;

export type TranslateCopyRequest = {
  from: "en" | "es";
  to: "en" | "es";
  texts: Record<string, string>;
};

export function parseTranslateCopyRequest(
  body: unknown,
): { ok: true; value: TranslateCopyRequest } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid JSON body" };
  }
  const { from, to, texts } = body as Record<string, unknown>;
  if ((from !== "en" && from !== "es") || (to !== "en" && to !== "es") || from === to) {
    return { ok: false, error: "from and to must be 'en' and 'es' and must differ" };
  }
  if (!texts || typeof texts !== "object" || Array.isArray(texts)) {
    return { ok: false, error: "texts must be an object of strings" };
  }
  const entries = Object.entries(texts);
  if (entries.length === 0) return { ok: false, error: "texts is empty" };
  if (entries.length > MAX_TRANSLATE_FIELDS) {
    return { ok: false, error: `Too many fields (max ${MAX_TRANSLATE_FIELDS})` };
  }
  let totalChars = 0;
  const clean: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.trim() === "") {
      return { ok: false, error: `texts[${JSON.stringify(key)}] must be a non-empty string` };
    }
    totalChars += value.length;
    clean[key] = value;
  }
  if (totalChars > MAX_TRANSLATE_CHARS) {
    return { ok: false, error: `Too much text (max ${MAX_TRANSLATE_CHARS} characters)` };
  }
  return { ok: true, value: { from, to, texts: clean } };
}

/** Keep only keys that were in the request, with non-empty string values. */
export function filterTranslations(
  input: Record<string, string>,
  raw: unknown,
): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key in input && typeof value === "string" && value.trim() !== "") out[key] = value;
  }
  return out;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx tsx --test src/lib/ai/translate-copy.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Implement the route**

Create `src/app/api/admin/translate-copy/route.ts`:

```ts
export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { parseTranslateCopyRequest, filterTranslations } from "@/lib/ai/translate-copy";

const anthropic = new Anthropic();

const LOCALE_NAMES = { en: "English", es: "Spanish" } as const;

export async function POST(request: NextRequest) {
  const adminPassword = process.env.ADMIN_PASSWORD;
  const sessionCookie = request.cookies.get("admin_session")?.value;
  if (!adminPassword || sessionCookie !== adminPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = parseTranslateCopyRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { from, to, texts } = parsed.value;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Translate the values of this JSON object from ${LOCALE_NAMES[from]} to ${LOCALE_NAMES[to]}. The values are website copy for a small home-services business.

${JSON.stringify(texts, null, 2)}

RULES:
- ${to === "es" ? "Use natural Latin American Spanish, the kind spoken in NYC neighborhoods." : "Use natural, plain US English."}
- Keep the tone and approximate length of each value.
- Do not translate business names, people's names, or place names.
- Return ONLY a JSON object with exactly the same keys and translated string values — no explanation, no markdown.`,
        },
      ],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }
    let raw: unknown;
    try {
      raw = JSON.parse(jsonMatch[0]);
    } catch {
      return NextResponse.json({ error: "Failed to parse AI response" }, { status: 502 });
    }
    const translations = filterTranslations(texts, raw);
    return NextResponse.json({ success: true, translations });
  } catch (error) {
    console.error("[admin/translate-copy] translation failed", error);
    return NextResponse.json({ error: "Translation failed" }, { status: 502 });
  }
}
```

- [ ] **Step 6: Verify types/lint and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add src/lib/ai/translate-copy.ts src/lib/ai/translate-copy.test.ts src/app/api/admin/translate-copy/route.ts
git commit -m "feat(admin): founder-gated AI copy translation endpoint"
```

---

### Task 4: Editor button

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx` — imports, component state (~line 760), a handler next to `handleSave`, and the content-locale toggle row (~line 1109)

**Interfaces:**
- Consumes: `collectMissingTranslations` / `applyTranslations` from `@/lib/home-services/translate-fields`; `POST /api/admin/translate-copy` from Task 3.

- [ ] **Step 1: Add the import**

```ts
import { applyTranslations, collectMissingTranslations } from "@/lib/home-services/translate-fields";
```

- [ ] **Step 2: Add state and handler inside `HomeServicesSiteEditor`**

Near the other `useState` calls (~line 760):

```ts
const [translating, setTranslating] = useState(false);
const [translateNote, setTranslateNote] = useState<string | null>(null);
const [translateError, setTranslateError] = useState<string | null>(null);
```

Near `handleSave`:

```ts
const handleTranslateMissing = async () => {
  const to = contentLocale;
  const from = to === "en" ? "es" : "en";
  setTranslateError(null);
  setTranslateNote(null);
  const texts = collectMissingTranslations(draft, from, to);
  if (Object.keys(texts).length === 0) {
    setTranslateNote(
      `Nothing to translate — all ${to === "es" ? "Español" : "English"} fields are filled.`,
    );
    return;
  }
  setTranslating(true);
  try {
    const res = await fetch("/api/admin/translate-copy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, texts }),
    });
    const data: unknown = await res.json().catch(() => ({}));
    const payload = (data ?? {}) as { translations?: unknown; error?: unknown };
    if (!res.ok || !payload.translations || typeof payload.translations !== "object") {
      setTranslateError(typeof payload.error === "string" ? payload.error : "Translation failed");
      return;
    }
    const translations = payload.translations as Record<string, string>;
    const count = Object.keys(translations).length;
    setDraft((current) => applyTranslations(current, to, translations));
    setTranslateNote(
      `${count} field${count === 1 ? "" : "s"} translated from ${from === "en" ? "English" : "Español"} — review and Save.`,
    );
  } catch {
    setTranslateError("Network error");
  } finally {
    setTranslating(false);
  }
};
```

(The `setDraft((current) => ...)` functional form is required — same async-gap rule as the image upload handlers in this file.)

- [ ] **Step 3: Extend the locale-toggle row (~line 1109)**

Replace the toggle row `<div className="flex gap-2">...</div>` with:

```tsx
<div className="flex flex-wrap items-center gap-2">
  {(["en", "es"] as const).map((locale) => (
    <button
      key={locale}
      type="button"
      onClick={() => setContentLocale(locale)}
      className={`rounded-full px-4 py-1.5 text-sm font-medium ${
        contentLocale === locale
          ? "bg-amber-100 text-amber-800"
          : "bg-gray-100 text-gray-600"
      }`}
    >
      {locale === "en" ? "English" : "Español"}
    </button>
  ))}
  <button
    type="button"
    onClick={() => void handleTranslateMissing()}
    disabled={translating}
    className="rounded-full border border-amber-300 px-4 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
  >
    {translating ? "Translating…" : "Translate missing fields with AI"}
  </button>
</div>
{(translateNote || translateError) && (
  <p className={`text-sm ${translateError ? "text-red-600" : "text-gray-600"}`}>
    {translateError ?? translateNote}
  </p>
)}
```

- [ ] **Step 4: Verify and commit**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

```bash
git add 'src/app/(admin)/clients/[tenantId]/edit/HomeServicesSiteEditor.tsx'
git commit -m "feat(home-services): translate-missing-fields AI button in founder editor"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full suite, typecheck, lint, build**

Run:
```bash
find src \( -name '*.test.ts' -o -name '*.test.tsx' \) | xargs npx tsx --test 2>&1 | grep -E "^# (tests|pass|fail)"
npx tsc --noEmit && npm run lint && npm run build
```
Expected: all tests pass (485+), clean build. Confirm the count includes the new `translate-fields` and `translate-copy` test files.

- [ ] **Step 2: Live-call smoke test (requires ANTHROPIC_API_KEY in .env.local)**

Only if the key is present locally: `npm run dev`, then

```bash
curl -s -X POST http://localhost:3000/api/admin/translate-copy \
  -H "Content-Type: application/json" \
  -H "Cookie: admin_session=$ADMIN_PASSWORD" \
  -d '{"from":"en","to":"es","texts":{"desc.x":"Weekly mowing and edging for small yards."}}'
```

Expected: `{ "success": true, "translations": { "desc.x": "<Spanish text>" } }`. Also confirm a request without the cookie returns 401. If no key is available, note it as a release caveat instead.

- [ ] **Step 3: Hand off**

Report results; remaining browser verification (button in the editor UI) is a manual founder pass.
