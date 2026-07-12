# Task 6 report

## Result

- Added founder/tenant-scoped independent text and email diagnostics to the admin list.
- Added exact `text | email` resend validation and channel-isolated persistence.
- Text retry regenerates signed photo links and retains WhatsApp-to-SMS fallback.
- Email retry reloads the tenant-owned email and sends through the existing Resend sender.
- Diagnostics UI shows independent channel state/error rows and retry actions only for configured failures.

## TDD and verification

- RED: `npx tsx --test tests/estimate-admin-contract.test.mjs` failed on the absent email sender, channel diagnostics, and separate UI actions.
- GREEN: `npx tsx --test tests/estimate-admin-contract.test.mjs tests/estimate-api-contract.test.mjs`
- Type check: `npx tsc --noEmit`
- Diff hygiene: `git diff --check`

## Self-review

- Founder cookie check and both request/tenant IDs remain mandatory.
- Every estimate request read/update remains constrained by both request ID and tenant ID.
- Email update contains only email channel columns; text update contains text and legacy text compatibility columns.
- No signed photo URLs are returned by the list endpoint.

## Concerns

- Contract tests are source-level integration contracts; provider calls remain covered by their existing sender unit tests.

## Fix: executable tenant and channel isolation evidence

- Extracted the resend decision path into the production-used `executeAdminEstimateResend` helper with injected lookup, provider, and update boundaries. Executable tests prove unauthorized requests return 401 with zero dependency calls, every non-exact channel returns 400 before lookup, and a request absent from the supplied tenant scope returns 404.
- Executable call logs prove lookup and final update both receive `requestId` plus `tenantId`; email retry invokes only email and persists only email fields; text retry invokes only text and persists only text plus the legacy compatibility fields.
- Added a production-used channel diagnostic projection and retry predicate. Executable value assertions prove text/email state, destination, provider ID, and error remain independent, and retry visibility requires that specific channel to be failed with a configured destination.
- Focused verification: `npx tsx --test src/lib/estimate-admin-resend.test.ts src/lib/estimate-admin-diagnostics.test.ts tests/estimate-admin-contract.test.mjs tests/estimate-api-contract.test.mjs` — 14/14 passed.
- Type verification: `npx tsc --noEmit` — passed. Diff hygiene: `git diff --check` — passed.
- Final covering verification: `npx tsx --test src/lib/estimate-retry-state.test.ts src/lib/estimate-admin-resend.test.ts src/lib/estimate-admin-diagnostics.test.ts tests/estimate-admin-contract.test.mjs tests/estimate-api-contract.test.mjs` — 16/16 passed; `npx tsc --noEmit` and `git diff --check` both exited 0.
- Defense-in-depth preview tenant filtering was not added: the preview lookup is keyed by the tenant-owned `preview_slug`; no verified tenant predicate was available in the queried preview shape without expanding schema assumptions.

## Fix: keyed diagnostics retry UI state

- Replaced the shared retry key/error with production-used reducer state indexed by `${requestId}:${channel}`. Each start, success, and failure updates only its own entry; list-loading errors remain separate from retry errors.
- The text and email rows now read pending labels, disabled state, and retry failure text exclusively from their matching key.
- RED evidence: `npx tsx --test src/lib/estimate-retry-state.test.ts` failed with `Cannot find module './estimate-retry-state'` before the helper existed.
- GREEN evidence: `npx tsx --test src/lib/estimate-retry-state.test.ts` — 2/2 passed, covering concurrent starts, one completion preserving the other pending retry, and request/channel-local errors.
- Contract verification: `node --test tests/estimate-admin-contract.test.mjs` — 4/4 passed.
- Type verification: `npx tsc --noEmit` — passed. Diff hygiene: `git diff --check` — passed.
