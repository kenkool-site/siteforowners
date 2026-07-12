# Task 7 verification report

## Result

- Feature-scope verification is green except for one unrelated, pre-existing Runway presentation contract failure.
- Fixed the accumulated Task 4 minor where a corrected photo selection could retain a stale photo error and require a second submit. Commit: `3032449 fix: clear corrected estimate photo errors`.
- No production migration was applied and no real prospect was contacted.

## Exact commands and results

1. RED regression proof:
   - `npx tsx --test src/components/templates/home-services/estimate-photo-selection.test.ts`
   - Exit 1: `Cannot find module './estimate-photo-selection'`, the expected failure before the validator existed.
2. Focused GREEN proof:
   - `npx tsx --test src/components/templates/home-services/estimate-photo-selection.test.ts`
   - Exit 0: 1 test, 1 pass, 0 fail.
3. Initial full suite:
   - `rg --files src tests -g '*.test.ts' -g '*.test.mjs' -0 | xargs -0 npx tsx --test`
   - Exit 1: 522 tests, 520 pass, 2 fail. One branch-caused contract expected photo-limit constants to remain directly in the form after validation was extracted; one unrelated Runway failure remained.
4. Final full suite after updating the feature contract to inspect the extracted validator:
   - `rg --files src tests -g '*.test.ts' -g '*.test.mjs' -0 | xargs -0 npx tsx --test`
   - Exit 1: 522 tests, 521 pass, 1 fail.
   - Remaining failure: `tests/runway-template-polish.test.mjs`, `runway typography makes the business name dominant without oversized body text`, assertion `Runway about should derive a shorter pull quote instead of enlarging an entire paragraph`. Classified unrelated/pre-existing: it is in the Runway presentation area, is outside this home-services estimate branch scope, and was explicitly excluded by the task brief unless caused by this branch.
5. Type checking:
   - `npx tsc --noEmit`
   - Exit 0, no output.
6. Production build:
   - `npm run build`
   - Exit 0. Next.js 14.2.35 compiled, lint/type validation completed, 74/74 static pages generated, and route optimization completed. Non-fatal warnings: Node ESM loading warning and Next.js edge-runtime static-generation warning.
7. Diff hygiene:
   - `git diff --check`
   - Exit 0, no output.
8. Repository state recorded after the feature-fix commit:
   - `git status --short && git log -7 --oneline`
   - Status was clean before this report was created. Latest feature commit was `3032449 fix: clear corrected estimate photo errors`, followed by `c1882cb`, `ab1eb9e`, `b36c699`, `674739f`, `eb86f35`, and `65e5747`.

## Manual-verification limitation and executable audit

- Browser/manual verification was unavailable in this delegated verification environment, so no claim is made that a browser session ran.
- Marketing preview behavior was audited through passing executable tests/contracts covering modal service preselection/reset, CTA-to-modal wiring, `preview_mock` selection, preview locale routing, and the preview-mock branch completing without reaching the tenant API path. The full suite passed all such feature tests.
- Development demo persistence and delivery were not exercised against a live database/provider because that could create a real `estimate_requests` row or send a notification. Passing executable tests/contracts cover default `preferred_response = 'sms'`, tenant-scoped insertion, text/email orchestration, photo-warning behavior, independent channel diagnostics, and channel-local resend state.

## Concerns

- Release verification is not globally all-green because the single pre-existing Runway contract failure remains.
- A safe, isolated development tenant plus explicitly non-real notification destinations are still required for the requested live database/provider smoke test.
