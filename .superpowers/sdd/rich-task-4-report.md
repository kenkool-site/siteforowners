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
