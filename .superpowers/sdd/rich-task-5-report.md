# Richer homepage Task 5 verification report

Date: 2026-07-12

## Result

Compatibility and automated release verification passed. No production data was changed and no prospects were contacted.

## Verification defect fixed with TDD

- Added a regression proving the public parser accumulates valid process and service-area rows until their respective caps instead of slicing raw input before validation.
- RED evidence: `npx tsx --test src/lib/home-services/types.test.ts src/lib/home-services/preset-outdoor-services.test.ts` failed 1 of 9 tests because only `step-0` and `step-1` survived when an invalid row preceded three valid rows.
- GREEN evidence: the same focused command passed 9 of 9 after moving the caps after filtering.
- Strengthened the outdoor preset test to directly assert all three seeded English and Spanish process bodies.

## Automated gates

- Feature suite: `npx tsx --test src/lib/home-services/*.test.ts src/components/templates/home-services/*.test.ts src/components/templates/home-services/*.test.tsx tests/home-services-*.test.mjs tests/estimate-*.test.mjs`
  - Exit 0; 69 tests passed, 0 failed.
  - Coverage includes the 375px render contract, conversion-story order, city/ZIP and localized notes, proof fallback, bilingual process, preview locale switching, all estimate CTA controller wiring, summary-only legacy coverage, editor interaction/validation contracts, and server-side touched-config validation.
- Production gates: `npx tsc --noEmit && npm run build && git diff --check`
  - Exit 0. TypeScript passed, Next.js compiled and generated 74 static pages, and diff check passed.

## Warnings and limitations

- The feature suite emitted a non-failing `next-intl` `ENVIRONMENT_FALLBACK` stack while server-rendering `HomeServicesNav`; all 69 tests still passed. This was present outside the parser correction and was not treated as a new feature failure.
- The production build emitted the existing Node ES-module warning and the Next.js edge-runtime/static-generation advisory; the build exited 0.
- Browser/manual visual verification at 375px and desktop was unavailable in this task run. Automated rendered/contract tests were used; this report does not claim visual browser verification.
- A full `HomeServicesSiteEditor` save/reload integration test was not added. The current editor is coupled to the broader admin editor and network persistence harness; building a reliable end-to-end harness would be a substantial scope expansion. Existing tests cover add/reorder/remove interactions, malformed/duplicate ZIP blocking, validation-before-fetch, merged server validation, config preservation, and locale rendering, but do not prove a real persisted reload in a browser.

## Final-review fixes

- Added `validateHomeServicesConfigUpdate` and routed production `update-site` persistence through it. The helper merges nested `sections`/`section_copy`, validates and normalizes owned fields, and preserves arbitrary stored top-level sibling objects. A regression verifies an unmodeled integration object survives a partial update.
- Structured service areas now render a nonblank coverage summary as an optional introduction above the semantic list. Summary-only remains exact; empty summary plus no areas still renders nothing.
- Retained conditional Why Us for backward compatibility and moved it after How It Works, with rendered order and section-spacing coverage. The approved order is recorded in the design spec.
- Final focused suite: 71 passed, 0 failed. `npx tsc --noEmit`, `npm run build` (74 static pages), and `git diff --check` all exited 0.
- Non-failing warnings remain the previously documented `next-intl` environment fallback during server rendering, Node ES-module warning, and Next edge-runtime static-generation advisory.

## Scope and release safety

- No production records were created or updated.
- No prospect outreach occurred.
- Files changed for this verification are limited to the public parser, its regression test, the seeded bilingual-body assertion, and this report.
