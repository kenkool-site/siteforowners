# Richer homepage Task 3 report

## Status

Implemented the approved public conversion-story composition with localized resolved section copy, a three-step process, structured semantic service areas, responsive proof/area composition, hero coverage signal, and a richer final CTA.

## Boundaries preserved

- Every estimate entry point uses the single `onEstimate` reducer/controller and existing modal.
- Service-card estimate preselection remains intact.
- Preview and tenant estimate delivery modes remain owned by their existing callers.
- Home services remain isolated from stylist orchestration.
- Structured coverage uses founder-entered area names and ZIPs only; no maps or addresses are rendered.
- Legacy localized coverage summaries remain the exact summary-only fallback when structured rows are absent.

## Verification

- `npx tsx --test tests/home-services-template-contract.test.mjs src/lib/home-services/content-defaults.test.ts` — 11 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Notes

- Reviews render before service areas on mobile; the pair becomes two columns at `lg`, while either survivor remains full width.
- Call and Message controls are omitted when their corresponding configured links are unavailable.
- Existing optional Why Us content remains between recent work and the new process so current tenant content is not silently discarded.

## Review-fix evidence (2026-07-12)

- Structured service areas now suppress the legacy coverage summary; summary-only coverage preserves the exact configured string; empty coverage returns `null`.
- Optional Why Us renders between Gallery and Process with a muted section background and contrasting cards.
- Added rendered React/JSDOM behavioral coverage in `src/components/templates/home-services/richer-homepage.render.test.tsx` for structured/summary/empty coverage, localized ZIPs and notes, CTA omission and estimate invocation, service preselection, proof layout fallbacks, default bilingual process copy, process omission contract, 44px controls, and mobile-first stacking.
- `npx tsx --test src/components/templates/home-services/richer-homepage.render.test.tsx tests/home-services-template-contract.test.mjs src/lib/home-services/content-defaults.test.ts` — 18 passed, 0 failed.
- `npx tsc --noEmit` — passed with exit code 0.
- `git diff --check` — passed with exit code 0.
