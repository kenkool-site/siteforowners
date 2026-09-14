# Task 3 — Founder provisioning and event repository

## Status

Complete and self-reviewed on top of accepted base `3c4572693b7cc836b2f35aab2eddd8c7756628db`.

## Inherited partial work audited

The working tree already contained the complete Task 3 implementation, uncommitted. I preserved it rather than restarting it. It provides:

- A server-only invitation repository, injected adapter core, generated six-digit PINs/title-based base36 slugs, canonical owner email, default limits (250 submissions, 250 email, 50 SMS), event `endsAt` projection, list rollups, and credential-hash-free management projection.
- Atomic owner-and-event provisioning in migration `038`, using one security-definer RPC with a pinned empty search path, revoked public/anon/authenticated execution, and a service-role grant.
- A founder-only, strict-same-origin creation route; founder list/new/detail screens; one-time copyable PIN; preview/copy/edit actions; middleware protection; and an Invitations founder-nav entry.
- Repository, migration-security, middleware, and founder-navigation tests, plus the `server-only` dependency.

## Recovery work

- Audited every changed/untracked file against the Task 3 brief; the diff is confined to founder provisioning, invitation operations UI, route protection, navigation, tests, and the required migration.
- Ran whitespace validation (`git diff --check`) with no findings.
- Searched the task artifacts for prior `RED`/failing-test evidence; none exists. I did **not** observe or claim the requested initial RED run. The first runnable repository test I observed was green because the inherited implementation was already present.
- Identified that sandbox execution prevents `tsx` from creating its IPC socket; reran the same commands with the required local execution permission. A first aggregate command was stopped by zsh glob expansion of `(admin)` paths before test startup; the null-delimited rerun below executed the full suite.

## Verification

| Command | Result |
| --- | --- |
| `npx tsx --test src/lib/invitations/repository.test.ts src/lib/admin-navigation.test.ts src/middleware.test.ts src/lib/invitations/provisioning-migration-contract.test.ts` | 12 passed, 0 failed |
| `npx tsc --noEmit` | exit 0 |
| `rg --files src -g '*.test.ts' -0 \| xargs -0 npx tsx --test` | 510 passed, 0 failed |

## Files in scope

- `package.json`, `package-lock.json`
- `src/app/(admin)/_components/AdminHeader.tsx`
- `src/app/(admin)/admin/invitations/page.tsx`
- `src/app/(admin)/admin/invitations/new/page.tsx`
- `src/app/(admin)/admin/invitations/[eventId]/page.tsx`
- `src/app/api/invitations/admin/events/route.ts`
- `src/components/invitations/FounderEventForm.tsx`
- `src/components/invitations/InvitationCopyLinkButton.tsx`
- `src/lib/admin-navigation.ts`, `src/lib/admin-navigation.test.ts`
- `src/lib/invitations/repository.ts`, `src/lib/invitations/repository-core.ts`, `src/lib/invitations/repository.test.ts`
- `src/lib/invitations/provisioning-migration-contract.test.ts`
- `src/middleware.ts`, `src/middleware.test.ts`
- `supabase/migrations/038_invitation_owner_provisioning.sql`

## Self-review

- Repository boundary is marked `server-only`; API output contains only `eventId`, `slug`, and the one-time plaintext PIN. List/detail projections do not select or return `pin_hash`/`passcode_hash`.
- Mutating API checks the existing `admin_session` against `ADMIN_PASSWORD` and rejects missing/mismatched origins before parsing/provisioning.
- `/admin/invitations` is checked in middleware before root-domain passthrough, and it is exposed through the existing founder header navigation without changing tenant owner tabs.
- The migration inserts owner then event in the same PostgreSQL function. If the event insert fails, PostgreSQL aborts the function transaction, so no partial owner survives.
- The management projection maps nullable `ends_at` to nullable `endsAt` and its test confirms hash values cannot survive the mapping.

## Concerns / handoff

- No recoverable proof of the earlier intended RED state exists; verification evidence starts with the inherited implementation already green.
- Runtime provisioning requires migration `038_invitation_owner_provisioning.sql` to be applied in the target Supabase database; the repository and migration contracts are tested, but this recovery did not use a live database.

## Fix Round 1 — timezone conversion and fail-closed founder access

### Findings addressed

- The founder form previously converted `datetime-local` input with `new Date(localStart)`, which applies the browser timezone instead of the selected event IANA timezone.
- Middleware previously permitted `/admin/invitations` when `ADMIN_PASSWORD` was absent because its redirect condition only ran when a password was truthy. The invitation list could then reach its service-role repository query.

### TDD evidence

- **RED:** `npx tsx --test src/lib/invitations/event-time.test.ts src/lib/invitations/founder-access.test.ts src/middleware.test.ts` initially produced 1 pass and 3 failures: the two new modules were absent, and the missing-secret middleware assertion received `200` rather than the required `307` redirect.
- **GREEN:** after implementation, `npx tsx --test src/lib/invitations/event-time.test.ts src/lib/invitations/founder-access.test.ts src/middleware.test.ts && npx tsc --noEmit` produced 5 passing tests, 0 failures, and TypeScript exit 0.

### Changes and self-review

- Added `src/lib/invitations/event-time.ts` and its regression test. It uses standard `Intl.DateTimeFormat` with the selected IANA timezone, not browser-local parsing, and validates an instant-to-wall-time round trip. An invalid date/time, invalid timezone, or spring-forward DST gap is presented to the operator as a clear form error. The test forces a Los Angeles browser zone while selecting New York and verifies the expected `13:00Z` instant.
- Added `src/lib/invitations/founder-access.ts` and its test. The shared predicate fails closed for an undefined/empty secret, missing cookie, and mismatched cookie; the API route and middleware use it.
- Added `src/app/(admin)/admin/invitations/layout.tsx` as a server-side defense-in-depth guard for every invitation page, including nested new/detail pages. It redirects to `/login` unless the existing `admin_session` matches a configured founder secret.
- Updated `src/middleware.test.ts` to cover a mismatched cookie and an empty/missing `ADMIN_PASSWORD` on the root-domain invitations route.

### Files

- `src/components/invitations/FounderEventForm.tsx`
- `src/lib/invitations/event-time.ts`, `src/lib/invitations/event-time.test.ts`
- `src/lib/invitations/founder-access.ts`, `src/lib/invitations/founder-access.test.ts`
- `src/app/(admin)/admin/invitations/layout.tsx`
- `src/app/api/invitations/admin/events/route.ts`
- `src/middleware.ts`, `src/middleware.test.ts`

### Remaining concern

- The converter intentionally uses the earlier occurrence for an ambiguous fall-back wall time; the reviewed finding required clear rejection of invalid/nonexistent times, not an additional operator choice for ambiguous times.
