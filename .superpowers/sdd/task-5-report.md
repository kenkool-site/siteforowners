# Task 5 report: estimate delivery fan-out

## Status

Implemented tenant estimate fan-out to independently configured text and email channels.

## Changes

- Selects the owner email exclusively from the Host-resolved tenant (`email`, then `admin_email`).
- Accepts estimate leads when either text or email is configured and persists the lead before provider calls.
- Initializes independent text/email delivery states while retaining legacy text delivery columns.
- Runs configured text and email delivery concurrently, normalizes provider rejections to durable failure results, and returns public success after persistence.
- Preserves WhatsApp-to-SMS fallback and records the actual fallback channel/destination.
- Added API contracts plus behavioral tests for fallback and thrown text-provider failures.

## Verification

- `npx tsx --test src/lib/estimate-notification.test.ts src/lib/estimate-email.test.ts src/lib/estimate-delivery.test.ts tests/estimate-api-contract.test.mjs` — 18 passed, 0 failed.
- `npx tsc --noEmit` — passed.
- `git diff --check` — passed.

## Self-review

- Host remains the sole tenant authority; owner destinations are never accepted from form data.
- Database insertion precedes photo work and all delivery calls.
- Both promises settle to channel results, so a provider failure cannot cancel the sibling channel.
- Email-only requests keep legacy `notification_state` within its existing `pending|sent|failed` constraint while the new text state records `not_configured`.

## Concerns

- Route-level provider combinations are contract-covered rather than executed through a full Next/Supabase integration harness; channel normalization and fallback have direct unit coverage.
