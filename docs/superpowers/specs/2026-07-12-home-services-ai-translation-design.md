# Home-Services AI Copy Translation — Design

**Date:** 2026-07-12
**Branch:** fix/home-services-gallery-fallback-and-areas (continuation)
**Status:** Approved

## Problem

The founder editor keeps English and Spanish copy in separate maps. A service
description typed in English does not exist in Spanish, so switching the
content locale to Español shows an empty field, and the live Spanish site
shows a blank card. There is no way to translate copy without retyping it.

## Decisions (user-confirmed)

- **Scope:** all bilingual editor copy, not just service descriptions.
- **Trigger:** an explicit editor button that fills the draft; founder reviews
  and saves. No auto-translation at save time.
- **Live-site fallback:** Spanish visitors see the English service description
  when no Spanish one exists (until translated). Fallback is scoped to service
  descriptions; the button covers the rest.

## Background (what exists)

- Claude client: `@anthropic-ai/sdk`, `new Anthropic()` with `ANTHROPIC_API_KEY`,
  model `claude-haiku-4-5-20251001` everywhere (`src/lib/ai/generate-copy.ts`).
  No translate-only function exists; generation always produces en+es together.
- Founder-gated AI route pattern: `src/app/api/suggest-theme-colors/route.ts` —
  `admin_session` cookie must equal `ADMIN_PASSWORD`, else 401.
- Editor draft shape (`HomeServicesSiteEditor.tsx`, exported `EditorDraft`):
  `generated_copy.{en,es}` each with `hero_headline`, `hero_subheadline`,
  `about_paragraphs: string[]`, `seo_title`, `seo_description`,
  `footer_tagline`, `google_business_description`,
  `service_descriptions: Record<client_id, string>`; plus
  `home_services_config` with `section_copy` (`eyebrow/title/intro_{en,es}`
  per section), `trust_points[].label_{en,es}`,
  `why_us_points[].title_/body_{en,es}`, `process_steps[].title_/body_{en,es}`,
  `gallery_projects[].caption_{en,es}`, `coverage_summary_{en,es}`.
- `client_id` is a stable identity key; description maps are keyed by it.
- No AI route currently has rate limiting; cost controls are `max_tokens` +
  `maxDuration`.

## Design

### 1. Translation API — `POST /api/admin/translate-copy`

New route `src/app/api/admin/translate-copy/route.ts`.

- **Auth:** `admin_session` cookie === `ADMIN_PASSWORD` (same as
  suggest-theme-colors); otherwise 401. No rate limit (founder-gated, low
  volume) — consistent with the other AI routes.
- **Request:** `{ from: "en" | "es", to: "en" | "es", texts: Record<string, string> }`.
  `from !== to`; `texts` values non-empty strings. Caps: max 150 entries and
  max 20,000 total source characters → 400 with a clear error beyond either.
  Empty `texts` → 400.
- **Claude call:** model `claude-haiku-4-5-20251001`, `max_tokens: 4000`,
  `export const maxDuration = 60`. System prompt: translate business-website
  copy from {from} to {to}; for Spanish use natural Latin American Spanish;
  preserve tone, approximate length, and any markup-free plain text; do not
  translate proper nouns/brand names; return ONLY a JSON object with exactly
  the same keys, string values.
- **Response handling:** parse JSON (strip ```json fences if present).
  Keep only keys present in the input whose values are non-empty strings.
  Return `{ success: true, translations }`. Claude/API errors → 502 with
  `{ error }`; malformed JSON → 502.
- The route is copy-agnostic: it translates a flat string map. It has no
  knowledge of the editor draft shape (reusable by other verticals later).

### 2. Field table — `src/lib/home-services/translate-fields.ts`

Pure module owning the draft ⇄ flat-map mapping. Exports:

- `collectMissingTranslations(draft: EditorDraft, from: Locale, to: Locale): Record<string, string>`
  — returns `{ key: sourceText }` for every bilingual field where the target
  is empty/whitespace and the source is non-empty. Key scheme:
  - `copy.hero_headline`, `copy.hero_subheadline`, `copy.seo_title`,
    `copy.seo_description`, `copy.footer_tagline`,
    `copy.google_business_description`
  - `copy.about_paragraphs.<index>` (source array index; target array may be
    shorter or empty)
  - `desc.<client_id>` (service descriptions; services without a `client_id`
    are skipped)
  - `sc.<sectionKey>.eyebrow|title|intro` (section copy)
  - `trust.<id>.label`, `why.<id>.title`, `why.<id>.body`,
    `proc.<id>.title`, `proc.<id>.body`, `cap.<projectId>` (Recent Work
    caption), `coverage` (coverage summary)
  - Service-area names are deliberately excluded (proper nouns).
- `applyTranslations(draft: EditorDraft, to: Locale, translations: Record<string, string>): EditorDraft`
  — immutably writes values back using the same key scheme. Unknown keys and
  non-string values are ignored. `copy.about_paragraphs.<i>` writes into the
  target locale's array at index `i`; if the array is shorter, it is extended
  and any intermediate slots created by the extension are filled with empty
  strings.
- `EditorDraft` type is imported (type-only) from `HomeServicesSiteEditor`.

### 3. Editor button

In `HomeServicesSiteEditor`, next to the content-locale (EN/ES) toggle:

- Label: "Translate missing fields with AI" (static English label — the
  founder admin UI is English; the admin surface is not client-facing, so the
  bilingual rule for client-facing strings does not apply).
- On click: `collectMissingTranslations(draft, other, contentLocale)`.
  - 0 fields → inline note "Nothing to translate — all {locale} fields are
    filled.", no API call.
  - Otherwise POST `/api/admin/translate-copy`; while pending the button is
    disabled and reads "Translating…".
  - Success: `setDraft(applyTranslations(...))` via functional update; inline
    note "N fields translated from {from} — review and Save."
  - Failure: inline red error with the server message.
- Nothing is persisted; the founder reviews and uses the normal Save.

### 4. Live-site description fallback

- New pure helper in `src/lib/home-services/display.ts`:
  `mergeDescriptionsWithFallback(primary: Record<string, string> | undefined, fallback: Record<string, string> | undefined): Record<string, string>`
  — fallback entries first, overlaid by primary entries whose values are
  non-empty (an empty Spanish value must not mask English).
- `HomeServicesTemplate` passes
  `mergeDescriptionsWithFallback(copy?.service_descriptions, otherLocaleCopy?.service_descriptions)`
  to `HomeServicesServices`, where `otherLocaleCopy` is
  `data.generated_copy?.[locale === "es" ? "en" : "es"]`.

## Error handling

- Route: 401 unauthenticated, 400 invalid body/caps, 502 upstream/parse
  failure — all `{ error: string }`.
- Editor: all failures surface as inline text; the draft is untouched on
  failure.

## Testing

- `translate-fields.test.ts`: collect finds missing-only fields across every
  category; ignores empty sources; apply round-trips into a draft; unknown
  keys ignored; about_paragraphs index handling; excluded service-area names.
- `display.test.ts`: `mergeDescriptionsWithFallback` — primary wins, empty
  primary values don't mask fallback, missing maps tolerated.
- Route: request-validation unit test on extracted pure validator if trivial
  to extract; otherwise covered by the editor-side contract and manual pass.
- No JSDOM test for the button (the ServicesSection focus test pattern exists
  if regression risk emerges later).

## Out of scope

- Translating other verticals' editors (route is reusable; wiring is not).
- Auto-translation at save; translating the estimate-modal/i18n strings
  (those live in `messages/*.json`, not tenant copy).
- Rate limiting AI routes (pre-existing pattern; revisit separately).
- Fallback rendering for non-description fields.
