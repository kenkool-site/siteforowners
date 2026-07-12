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
- Marketing preview behavior was audited through source contracts covering modal service preselection/reset, CTA-to-modal wiring, `preview_mock` selection, and preview locale routing. Those source contracts do not prove rendered interaction. A separate rendered `HomeServicesEstimateForm` interaction test now proves invalid-photo feedback, corrected-photo recovery, and first-click `preview_mock` completion; it does not replace a full browser/manual preview audit.
- Development demo persistence and delivery were not exercised against a live database/provider because that could create a real `estimate_requests` row or send a notification. Passing executable tests/contracts cover default `preferred_response = 'sms'`, tenant-scoped insertion, text/email orchestration, photo-warning behavior, independent channel diagnostics, and channel-local resend state.

## Concerns

- Release verification is not globally all-green because the single pre-existing Runway contract failure remains.
- A safe, isolated development tenant plus explicitly non-real notification destinations are still required for the requested live database/provider smoke test.

## Task 7 photo-state regression follow-up (2026-07-12)

- Root cause: the earlier regression test passed only a valid file directly to the stateless validator, so it never created or observed the stale photo-error state reported by review.
- RED: `npx tsx --test src/components/templates/home-services/estimate-photo-selection.test.ts` exited 1 with `createEstimatePhotoSelectionState is not a function` after the test reproduced invalid selection -> `invalid`, corrected selection -> cleared error, and immediate submit validation -> no error.
- GREEN/final focused verification: `npx tsx --test src/components/templates/home-services/estimate-photo-selection.test.ts` exited 0 with 1 test, 1 pass, 0 fail.
- Home-services contract verification: `npx tsx --test tests/home-services-template-contract.test.mjs` exited 0 with 5 tests, 5 pass, 0 fail. The contract now also proves `HomeServicesEstimateForm` calls the tested `selectEstimatePhotos` transition.
- Type checking: `npx tsc --noEmit` exited 0 with no output.
- Diff hygiene: `git diff --check` exited 0 with no output.
- Environment note: the first combined final verification attempt was blocked by sandbox IPC (`listen EPERM` for a tsx pipe); rerunning the same verification with approved escalation exited 0.

## Task 7 rendered-form review follow-up (2026-07-12)

- Added `HomeServicesEstimateForm.render.test.tsx`, which mounts the actual form in JSDOM under `NextIntlClientProvider` with English messages, supplies `deliveryMode="preview_mock"`, enters the required contact fields, advances to project details, selects an invalid photo and observes the localized alert, replaces it with a valid photo and observes the alert disappear, clicks Submit once, and observes `onComplete` exactly once.
- The test uses React DOM directly rather than treating a source regex or pure helper as integration evidence. The existing helper test remains useful unit coverage only.
- RED proof: with the valid-selection transition temporarily changed to preserve its prior photo error, `npx tsx --test src/components/templates/home-services/HomeServicesEstimateForm.render.test.tsx` exited 1 at the rendered assertion expecting the alert to be absent after correction. The transition was then restored.
- Final GREEN and home-services verification: `npx tsx --test src/components/templates/home-services/HomeServicesEstimateForm.render.test.tsx src/components/templates/home-services/estimate-photo-selection.test.ts tests/home-services-template-contract.test.mjs && npx tsc --noEmit && git diff --check` exited 0: 7 tests passed, 0 failed; TypeScript emitted no errors; diff hygiene emitted no errors.

## Final-review fixes (2026-07-12)

- Initial estimate email delivery now uses the same normalized locale, preferred response, and complete freshly signed photo-link set as text delivery. Spanish formatting and both photo links are asserted in the formatter/provider test.
- Email and text retries both load `estimate_photos` with request and tenant scope, regenerate signed URLs, and pass shared photo data only to the selected provider. Email retry also carries the persisted preferred response and locale.
- Migration 035 now adds nullable channel columns, backfills legacy text state/provider ID/error, initializes email as not configured, then installs defaults, non-null constraints, and state checks. A migration ordering/content contract protects historical sent/failed accuracy.
- Unexpected email promise rejections are logged with server-side detail while the persisted channel error remains the stable `Email delivery failed` string. The Resend adapter no longer uses a broad interface assertion.
- Preferred-response validation now uses a real type guard rather than a misleading cast helper. The rendered JSDOM regression test guarantees unmount, window close, console restoration, and restoration/removal of every mutated global in `finally`.
- RED evidence: `npx tsx --test src/lib/estimate-email.test.ts tests/estimate-delivery-migration-contract.test.mjs tests/estimate-admin-contract.test.mjs` exited 1 with five expected failures: missing localized preference/photos, missing rejection logging, retry photo sharing absent, and migration backfill ordering absent.
- Focused GREEN: `npx tsx --test src/lib/estimate-email.test.ts tests/estimate-delivery-migration-contract.test.mjs tests/estimate-admin-contract.test.mjs src/components/templates/home-services/HomeServicesEstimateForm.render.test.tsx && npx tsc --noEmit` produced 12/12 passing tests; after a test-only nullability correction, TypeScript passed in the final gate.
- Full relevant estimate/home-services/admin contracts: `npx tsx --test src/lib/estimate-*.test.ts src/lib/validation/estimate-*.test.ts src/components/templates/home-services/*.test.ts src/components/templates/home-services/*.test.tsx tests/estimate-*.test.mjs tests/home-services-*.test.mjs` exited 0 with 79 tests passed, 0 failed.
- Final gate: `npx tsc --noEmit && npm run build && git diff --check` exited 0. Next.js compiled, lint/type validation completed, and generated 74/74 static pages. Non-fatal existing warnings were the Node ESM warning and edge-runtime static-generation warning.
