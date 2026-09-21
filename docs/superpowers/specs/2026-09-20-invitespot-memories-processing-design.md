# InviteSpot Memories — Processing Architecture Design

**Date:** 2026-09-20
**Status:** Approved in conversation
**Product stage:** Architectural design for a new major feature area, scoped to its processing pipeline only

## Summary

InviteSpot Memories extends the existing InviteSpot event platform (invitation, RSVP, guest messaging — built inside the SiteForOwners codebase) with a guest photo/video sharing feature: guests scan a QR code or open a link, upload photos with no account, and hosts get a moderated, organized gallery. This spec covers **the media processing pipeline only** — how an uploaded original becomes a gallery-ready derivative. It does not cover the guest-facing upload/gallery UX, the full data model, guest identity/token design, or moderation UI, which are a separate follow-up design pass (see Deferred Scope below).

Memories belongs to the existing event; it does not introduce a second identity system, a second guest/contact database, or a disconnected admin surface.

## Product Context (condensed)

The full feature, per product/UX guide review, spans:

- **Before event:** existing InviteSpot website + RSVP (already built)
- **During event:** guest photo/video collection via QR/link, live gallery
- **After event:** AI organization (Moments, Highlights, Find Me, semantic search), reminders, downloads, long-term archive

This is far too large for one implementation pass. Agreed phasing:

- **V1 Foundation — Part 1 (this spec's processing pipeline is part of this):** upload, R2 storage, resilient upload queue, thumbnails/display derivatives, host review/moderation, guest gallery, All Photos, Moments (manual/static grouping only), host downloads
- **V1 Foundation — Part 2:** communications integration (reminder automation reusing `invitation_notifications`), host dashboard Memories section
- **V1.1:** AI moment organization, duplicate grouping, AI Highlights, semantic search
- **V1.2:** Find Me (face search), Every Perspective, richer AI discovery
- **Later:** video highlight reel, story-of-the-day, live photo wall, photo challenges, voice/video guestbook, permanent archive upsell

## Current Architecture Audit

Findings from inspecting the actual repository (not assumed):

- **Stack:** Next.js 14 App Router, TypeScript strict, Tailwind, Supabase (Postgres + Auth + Storage), Vercel, Resend (email), Twilio (SMS), `next-intl` (en/es). No WhatsApp integration exists anywhere in the invitations module.
- **Event/guest/RSVP model:** `invitation_events`, `invitation_rsvps` (party-based, no guest accounts), `invitation_event_hosts` (cohost support). Guests are identified only via their RSVP row — there is no guest identity system to duplicate.
- **Auth:** `requireInvitationAccess` is the single gate for every mutation route, returning `{kind:"founder"}` or `{kind:"owner", ownerId}` — never a client-supplied ID. Memories reuses this unchanged.
- **Subdomain routing already works today:** `platform_subdomains` maps a subdomain label to an `invitation_event_id`, resolved in `middleware.ts`. `mercy-john.siteforowners.com` genuinely resolves through this mechanism now; a `/photos` path under the same event needs only a small middleware addition, not new routing infrastructure.
- **Existing media handling is the wrong shape to extend:** the `invitation-media` Supabase Storage bucket is scoped for host-curated design assets only (cover image + a 12-item gallery cap, 10MB image / 50MB-60s video limits). It has no per-guest attribution and no moderation queue. Memories needs its own plane, not an extension of this bucket.
- **Existing upload-ticket precedent worth reusing conceptually:** `src/lib/invitations/direct-media.ts` implements an HMAC-signed ticket (`createMediaUploadTicket`/`verifyMediaUploadTicket`) authorizing a direct write, then validates and finalizes after upload. Memories' guest-upload authorization follows the same shape against R2 instead of Supabase Storage. Its existing key convention — `{eventId}/{kind}/{file}`, no redundant `events/` prefix segment — is the naming convention Memories' object keys should follow too.
- **Notification infrastructure is fully built and directly reusable:** `invitation_notifications`, the `reserve_invitation_notification` RPC (atomic per-event/per-channel cap, shared across notification kinds), Resend/Twilio adapters, sent/failed/suppressed tracking, founder retry UI — this session's `celebrant_broadcast` work is the most recent addition to it. Memories' reminder automation (Part 2) sits on top of this unchanged; it is not covered further in this spec.
- **Cron:** Vercel Cron via `vercel.json`, `CRON_SECRET`-gated routes under `/api/cron/*`. Existing pattern (`send-reminders`): one daily cron, a pure `isReminderDue`-style due-check, sends only what's due today. This exact pattern is reused for DLQ draining (see below) — no new scheduling system introduced.
- **No storage plane beyond Supabase Storage exists anywhere in the codebase.** No R2, no S3 SDK, no presigned-upload code prior to this feature — the media plane is a clean slate; nothing to migrate away from.
- **Cloudflare API access already exists operationally:** `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` are already present in `.env.example`, currently scoped to DNS automation for custom domains. R2/Queues credentials are a new, separately-scoped token, not a reuse of this one — but Cloudflare as a vendor is already trusted infrastructure for this app.

## Reuse Map

| Existing | Memories reuses it for |
|---|---|
| `invitation_events`, `requireInvitationAccess`, owner/founder sessions | Every Memories permission check — no new identity system |
| `invitation_rsvps` | Guest identity linking (known RSVP guest vs. anonymous QR guest) — full design deferred |
| `platform_subdomains` + middleware | `mercy-john.siteforowners.com/photos` routing |
| `invitation_notifications` + `reserve_invitation_notification` + Resend/Twilio adapters | The entire reminder sequence (Part 2, not detailed here) |
| `direct-media.ts`'s ticket pattern | Conceptual model for the R2 upload-authorization ticket (ticket shape, not the Supabase-Storage-specific implementation) |
| Existing Vercel cron pattern (`send-reminders`) | DLQ draining (this spec) and, later, lifecycle jobs (upload window open/close, gallery expiration) |
| `EventEditor`/`OwnerGuestDashboard` admin shell | The future Memories dashboard section (Part 2 / follow-up) |
| Existing `next-intl` bilingual convention | All Memories UI strings (follow-up) |

## Global Constraints

- Extend existing architecture; never duplicate the event/guest/RSVP/auth/notification systems.
- Supabase remains the system of record for all relational/application metadata, including processing and moderation state. Cloudflare Queues is transport only — never the durable record of what happened.
- R2 stores media bytes; Vercel/Next.js never proxies original media bytes.
- Guest uploads go directly to R2 via presigned URLs issued by the Next.js API.
- Heavy processing is asynchronous and event-driven, not polled — a guest never waits for it.
- Originals are preserved unmodified; the gallery only ever serves optimized derivatives.
- Face data (V1.2, not built yet) must never cross event boundaries — noted here as a standing constraint on any storage/schema decision, even though Find Me itself is out of scope for this spec.
- Storage and processing implementations sit behind `StorageProvider` and `ProcessingProvider` interfaces — no R2- or Cloudflare-specific detail leaks into application code outside those two modules.
- Design for idempotency everywhere: R2 event notifications and Cloudflare Queues are both at-least-once delivery, not exactly-once.
- Upload/processing/moderation/AI-enrichment/gallery-visibility are five independent status dimensions — never conflated into one "status" column.

## Processing Architecture

### Chosen approach

An event-driven pipeline entirely within the Cloudflare plane for the processing hop, keeping Next.js/Vercel as the application plane only:

```
Guest browser
    │ POST /api/memories/upload/init (validate event/token/quota/MIME/size; write memory_media row)
    ▼
InviteSpot API (Next.js/Vercel)
    │ issues short-lived R2 presigned PUT/multipart URL
    ▼
Guest browser
    │ direct PUT to R2, originals/ prefix only
    ▼
R2 Event Notification (PutObject, prefix-filtered to originals/)
    ▼
Cloudflare Queue (memories-processing)
    ▼
Consumer Worker
    │ idempotency check → download original → ProcessingProvider.process()
    │ → decode, orientation-correct, resize, re-encode (strips EXIF/GPS as a side effect)
    │ → upload display/ + thumbnails/ derivatives to R2
    │ → update memory_media + memory_processing_jobs in Supabase
    ▼
Media is gallery-ready (AI enrichment, when it exists in V1.1+, runs afterward and separately —
never blocks this path)
```

This was chosen over polling Vercel Cron specifically because R2 is already the media plane, and an event-driven pipeline avoids introducing a polling mechanism that would likely be replaced shortly after V1.1 adds heavier processing needs.

### R2 event notification configuration

Confirmed against current Cloudflare R2 documentation: event notifications are configured per-bucket with prefix/suffix filtering, targeting a Queue directly.

```bash
wrangler r2 bucket notification create invitespot-memories \
  --event-type object-create \
  --prefix "originals/" \
  --queue memories-processing
```

Only `{eventId}/memories/originals/*` triggers the pipeline — enforced by the R2 notification rule's prefix filter itself, not by application-level convention. Writes to `display/`, `thumbnails/`, or `ai/` never re-trigger processing. (R2 supports up to 100 notification rules per bucket and each target queue has a 5,000 msg/sec ceiling — both far beyond anything this feature needs at event scale.)

### Object key structure

Following the existing `direct-media.ts` convention (`{eventId}/{kind}/{file}`, no redundant collection-name prefix):

```
{eventId}/memories/originals/{mediaId}.{ext}
{eventId}/memories/display/{mediaId}.webp
{eventId}/memories/thumbnails/{mediaId}.webp
{eventId}/memories/ai/{mediaId}.jpg          (reserved for V1.1+, not written in V1)
{eventId}/find-me/{sessionId}/selfie.jpg     (reserved for V1.2, not built in V1)
```

Originals remain private, accessed only via short-lived signed URLs for host download. Display/thumbnail derivatives are the only guest-facing gallery assets.

### Queue design

- One queue for V1: `memories-processing`.
- Default batching (`max_batch_size: 10`, `max_batch_timeout: 30s`) is sufficient for photo-only V1 volume; revisit only if video processing is added later, likely with its own queue and smaller batch size.
- Message payload: `{ mediaId, eventId, objectKey }` (R2's own event payload carries the object key; the Worker resolves `mediaId` via a Supabase lookup keyed on `object_key_original` for robustness against payload-shape changes).

### Worker responsibilities

Strictly the media processing plane — no application logic, no auth decisions, no notification sends:

1. Consume a batch of R2 object-create events.
2. Per event: idempotency check against `memory_media.processing_status` (see below).
3. Download the original from R2.
4. Run `ProcessingProvider.process()` → thumbnail + display derivatives.
5. Upload derivatives back to R2 at their deterministic keys.
6. Update `memory_media` and `memory_processing_jobs` in Supabase via a service-role REST/RPC call.
7. Leave `moderation_status` untouched (owned by the application plane's moderation-mode setting, not decided by the Worker).
8. Never call an AI/vision API synchronously in this path (V1 has none; V1.1's AI enrichment is a separate, later, non-blocking queue message).

### Supabase processing-job state machine

Five independent status dimensions on `memory_media` (full table schema deferred, but these columns are load-bearing for this spec):

```
upload_status:       pending → uploaded → upload_failed
processing_status:   pending → processing → ready → processing_failed
moderation_status:   pending → approved → hidden        (skipped if event mode = LIVE; mode design deferred)
ai_status:           not_started → processing → enriched → ai_failed   (V1.1+, always optional, unused in V1)
gallery_visible:      computed, not stored — true only when
                       upload_status=uploaded AND processing_status=ready
                       AND moderation_status IN (approved, not_required)
```

`memory_processing_jobs` is the durable, retryable unit of work — one row per attempt, not per media item:

```
id, media_id, job_type ('derivative' | 'ai_enrich'), attempt,
status ('pending' | 'running' | 'succeeded' | 'failed' | 'dead_letter'),
error_code, error_detail, queued_at, started_at, finished_at
```

This table, not the Cloudflare Queue, is what a host/admin "retry failed job" control reads and rewrites.

### Idempotency strategy

R2 event notifications and Cloudflare Queues are both at-least-once delivery — assumed, not treated as an edge case:

- The Worker's first action is a lookup by `object_key_original`; if `processing_status` is already `ready`, the message is acknowledged and dropped with no reprocessing.
- Derivative writes use deterministic keys, so a redelivered message safely overwrites rather than duplicates.
- `memory_processing_jobs` inserts are keyed on `(media_id, job_type, attempt)` to prevent a redelivered message forking a duplicate attempt row.
- Supabase status updates are conditioned (`WHERE processing_status != 'ready'`), so a stale or duplicate message can never regress a media item backward.

### Retry and dead-letter strategy

Confirmed against current Cloudflare Queues documentation:

- Consumer configured with `max_retries: 5` and a bound `dead_letter_queue: memories-processing-dlq`.
- Cloudflare Queues retries are immediate/queue-position-based, not a configurable exponential-backoff schedule — this is a platform characteristic to design around, not something to hand-roll inside the Worker.
- **DLQ draining uses a pull consumer, not a second Worker or Cloudflare Cron Trigger.** Cloudflare Queues supports pulling messages over plain HTTP from outside Workers entirely (confirmed current capability, not assumed), using an API token scoped to `queues_read`/`queues_write`. A new Vercel cron route, following the exact existing `send-reminders` pattern (`CRON_SECRET`-gated, registered in `vercel.json`), polls the DLQ on an interval (15–30 minutes is more than sufficient — DLQ drains are not latency-sensitive) and writes `memory_processing_jobs.status = 'dead_letter'` plus `memory_media.processing_status = 'processing_failed'` into Supabase, making the failure visible and retryable from the host dashboard. This was chosen specifically as the cheaper/easier option — reusing infrastructure already operated — precisely because DLQ draining has no performance requirement to trade against; the event-driven main pipeline is unaffected either way.
- A manual "retry" from the host dashboard re-publishes a fresh message to `memories-processing` with the same `mediaId`, going through the same idempotent path — it never talks to Cloudflare's DLQ directly.

### Image derivative mechanism

Sharp/libvips (the default Node answer) cannot run in Workers' V8-isolate runtime — no native bindings. Researched against current Cloudflare-native options rather than assumed:

- **Chosen for V1: `@cf-wasm/photon`** — a maintained WASM binding to Rust's `photon-rs`, runnable inside a Worker, supporting `resize()` and multi-format output (WebP/PNG/JPEG). Decoding to a raw pixel buffer and re-encoding inherently strips EXIF/GPS metadata as a side effect, serving the privacy requirement without a separate stripping step.
- **Needs verification at implementation time, not assumed now:** whether `@cf-wasm/photon` auto-applies EXIF orientation before the EXIF block is dropped, or whether an explicit pre-rotation step is required. This must be the first thing validated against a real phone-camera JPEG before the rest of the derivative pipeline is built on top of it — getting this wrong produces sideways thumbnails.
- **Considered and rejected for V1, not because it's unviable but for abstraction-cost reasons: Cloudflare Images** (the managed product). Would remove all custom resize/orientation/format-handling code, but means storing media across two Cloudflare products instead of one unified R2 plane, and is billed per-image on top of R2. Staying with the Worker+photon approach keeps the `ProcessingProvider` abstraction meaningful; if photon has real problems in practice (orientation, HEIC support, Workers CPU-time limits on large images — noted as needing the Workers Paid tier), swapping to Cloudflare Images later is a contained change behind that interface, not a rewrite.
- **Video derivatives are explicitly out of scope for V1** — confirmed by research, not just deferred by preference: nothing Workers-native handles video transcoding well today. Schema and interfaces should not preclude it, but the photo pipeline must be correct first.

### Provider abstractions

Per the standing constraint that Cloudflare-specific detail must not leak into application code:

```
StorageProvider
  createUpload() / createMultipartUpload() / completeMultipartUpload()
  getObject() / getSignedDownloadUrl() / deleteObject() / copyObject()

ProcessingProvider
  process(original: Bytes, options: DerivativeSpec) → { thumbnail, display }

AIProvider   (interface reserved now; no implementation before V1.1)
```

Not over-engineered — these exist because a future R2→S3 migration, or a future photon→Cloudflare-Images swap, or a future Worker→other-runtime swap for heavy operations (video transcoding, highlight-reel generation, ML inference), should each be a contained change behind one interface, not a rewrite of upload/gallery logic.

### Environment / secrets

New:
```
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_MEMORIES=invitespot-memories
CLOUDFLARE_QUEUES_API_TOKEN=          # queues_read + queues_write only — not the existing DNS-scoped token
MEMORIES_UPLOAD_TICKET_SECRET=        # or reuse SESSION_COOKIE_SECRET, matching direct-media.ts's convention
```

Reused, unchanged: `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ZONE_ID` (DNS automation — a separate, narrower-scoped token is required for Queues rather than broadening this one).

### Local development / testing strategy

Workers/Queues/R2 event notifications are genuinely hard to fully emulate offline — this is a deliberate departure from full local fidelity, not an oversight:

- **Unit/integration tests (the bulk of coverage):** `ProcessingProvider`, upload-authorization ticket logic, and the Supabase state machine are tested entirely with fakes/dependency injection, no real Cloudflare account touched — the same pattern already established for every `dispatch*`/`reserve*` function in this codebase's notification system.
- **The Worker itself:** run via `wrangler dev` against real (or a dedicated dev) R2/Queues resources. Its own glue code is treated as thin and mostly untested locally; real coverage lives in `ProcessingProvider`, not the Worker wrapper.
- **E2E (Playwright):** reuses the existing `INVITATION_E2E_FIXTURES=1` convention — fixture-mode uploads skip R2 entirely and simulate an already-`ready` media row, exactly the same tradeoff already accepted for RSVP-notification E2E fixtures.

### Deployment strategy

- The Worker deploys independently of the Next.js app (`wrangler deploy`), living in a new `workers/memories-processing/` directory in this repo, on its own release cadence.
- R2 bucket, Queue, and the notification rule are provisioned once via `wrangler` (or Terraform, since Cloudflare's current API has Terraform resources for Queues, worth using if reproducibility matters more than a one-time manual setup).
- No changes to the existing Vercel deployment pipeline beyond the new environment variables above and the new DLQ-draining cron route.

### Repository changes (this spec's scope only)

**New:**
- `supabase/migrations/056_invitation_memories_foundation.sql` — `memory_media`, `memory_processing_jobs` (full column list and any additional tables belong to the deferred data-model pass, not this spec)
- `src/lib/invitations/memories/storage-provider.ts`
- `src/lib/invitations/memories/processing-provider.ts`
- `src/lib/invitations/memories/upload-tickets.ts` — modeled on `direct-media.ts`'s ticket pattern, issuing R2 presigned URLs
- `src/app/api/memories/upload/init/route.ts`, `.../complete/route.ts`
- `src/app/api/cron/memories-dlq-drain/route.ts` — the pull-consumer DLQ drain, following `send-reminders`'s exact pattern
- `workers/memories-processing/` — the Cloudflare Worker (`wrangler.toml`, `src/index.ts`)

**Modified:**
- `.env.example` — new variables above
- `vercel.json` — register the new DLQ-drain cron

Nothing in the existing RSVP, notification, or comment-wall code changes — this is additive.

## Deferred Scope (explicitly not decided in this spec)

The following are known to be needed for V1 Foundation Part 1 as a whole, but were not designed in this pass and must not be treated as settled:

- Full `memory_media` schema beyond the processing-status columns above (uploader/guest attribution, EXIF-derived fields, moderation metadata beyond a single status)
- Guest identity/token design (known RSVP guest vs. anonymous QR guest vs. host/admin access levels; token contents and expiry)
- Moderation modes (PRIVATE / APPROVAL / LIVE) and the review-queue UI
- Guest-facing upload UI (resilient queue, retry/backoff, IndexedDB persistence) and gallery UX (Discovery vs. All Photos, Moments as a static/manual grouping for V1)
- Host dashboard Memories section and its metrics
- Lifecycle/retention settings (upload window, gallery expiration) and their scheduled jobs
- Security threat-model review beyond what this spec's idempotency/auth-reuse decisions already cover
- Observability/cost-tracking events

These are the subject of a follow-up design pass before a V1 Foundation Part 1 implementation plan can be written.
