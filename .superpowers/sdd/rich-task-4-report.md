# Richer homepage Task 4 report

## Status

Implemented the focused richer home-services content editor and integrated it into the existing founder edit and live-preview flow.

## Changes

- Added paired English/Spanish section-copy controls for all richer homepage sections.
- Added process-step and service-area editors with stable UUIDs, add/remove/reorder controls, disabled reorder boundaries, and 44px minimum targets.
- Added process visibility, ZIP parsing, retained draft values, and row-specific validation messages.
- Added client validation before the update request.
- Added defensive server validation only when `home_services_config` is touched. Partial config payloads merge with the stored config before validation; unrelated partial `generated_copy` updates remain unaffected.
- Preserved generated-copy merge behavior and existing preview/live editor paths and controls.

## Verification

- `npx tsx --test tests/home-services-editor-contract.test.mjs src/lib/home-services/editor-validation.test.ts` — 9 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Notes

- The initial RED attempt was blocked before test execution by the sandbox denying tsx's IPC socket (`listen EPERM`). The identical focused test command was rerun with execution approval and passed after implementation.
- No `any` types were introduced.

## Review-finding follow-up (2026-07-12)

- Added `mergeHomeServicesConfig`, a pure nested merge used by both the generated-copy merge and the production update route before validation/persistence. Partial `sections` and per-section `section_copy` patches now preserve all omitted stored fields.
- ZIP textareas now retain raw drafts by stable service-area ID while typing and parse on blur, so comma/newline entry and invalid text remain visible alongside validation feedback.
- Validation errors carry stable row IDs and render by ID, preventing errors from migrating after add/remove/reorder.
- Added rendered jsdom interactions covering multiline ZIP typing, raw invalid retention, matching row error, 44px/boundary controls, and add/remove/reorder. Added behavioral merge tests for partial `show_process`, partial per-section copy, and unrelated generated-copy updates.

Exact verification:

- `npx tsx --test tests/home-services-editor-contract.test.mjs tests/home-services-editor-interactions.test.tsx src/lib/home-services/editor-validation.test.ts src/lib/home-services/config-merge.test.ts src/lib/generated-copy-merge.test.ts` — 15 passed, 0 failed.
- `npx tsc --noEmit` — passed with no output.
- `git diff --check` — passed with no output.
