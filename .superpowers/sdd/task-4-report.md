# Task 4 report

Implemented one shared home-services estimate modal controller and routed all navigation, hero, service-card, estimate-section, and mobile-bar CTAs through `onEstimate`, including service preselection.

The modal provides an accessible labeled dialog, Escape/backdrop close, focus containment and restoration, body scroll locking, two stages, bilingual controls/copy, and a bottom-sheet layout at mobile widths. The form defaults to SMS, treats description/photos as optional, submits tenant requests to `/api/estimate`, and simulates preview success after 500ms without fetching. Marketing preview explicitly selects `preview_mock`; tenant sites explicitly select `tenant`, independent of demo state. Existing preview locale switching and non-home-services routing remain intact.

TDD evidence: the new reducer and source-contract suite first failed for the absent reducer/controller/delivery props, then passed after implementation.

Verification:

- `npx tsx --test src/components/templates/home-services/estimate-modal-state.test.ts tests/home-services-template-contract.test.mjs`: 5 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `git diff --check`: passed.

Self-review: confirmed no home-services `estimateHref` or `#estimate` builders remain, preview fetch is structurally excluded by the delivery-mode branch, tenant success uses live success copy, preview success explicitly says no contractor was contacted, and Spanish states the request was simulated.

Concern: browser-level interaction coverage is not present; accessibility behavior is implemented directly and covered by TypeScript/source contracts rather than an end-to-end dialog test.

## Fix

Addressed the Task 4 review findings by visibly marking both description and photos with the bilingual optional label; restoring structured tenant API errors (including 429 and 503), accessible required-field errors, autocomplete/input-mode hints, the honeypot, and client-side photo count/size/type/total validation; and formatting both modal components as maintainable multiline TypeScript. The `preview_mock` branch completes after its delay and returns before constructing tenant request data or calling `fetch`.

Exact verification commands and outputs:

- `npx tsx --test src/components/templates/home-services/estimate-modal-state.test.ts tests/home-services-template-contract.test.mjs`
  - `6` tests passed, `0` failed.
- `npx tsc --noEmit`
  - exited `0` with no output.
- `git diff --check`
  - exited `0` with no output.

TDD evidence: the focused contract test initially failed because `company_website` and the restored validation/error contracts were absent. It passed after the two-stage form restoration.
