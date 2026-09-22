# InviteSpot Memories — Guest Experience, Data Model & Moderation Design

**Date:** 2026-09-21
**Status:** Approved in conversation, pending written review
**Product stage:** Architectural design, second pass — covers everything explicitly deferred by the first spec

## Scope of this spec

The [first spec](./2026-09-20-invitespot-memories-processing-design.md) (approved, committed as `2aa26cd`) covered only the media processing pipeline (R2 → Event Notification → Queue → Worker → Supabase). It explicitly deferred everything else. This spec covers that deferred list:

- Full `memory_media` schema, plus `memory_upload_sessions`, `memory_moments`, `memory_moment_media`
- Guest identity/session design
- Moderation modes, the review-queue UI, and an AWS Rekognition-backed automated safety net (new since the first spec)
- Guest-facing upload UI (resilient queue) and gallery UX (All Photos, Moments/Discovery)
- Host dashboard Memories section
- Lifecycle/retention
- Security threat model

It does not revisit the processing pipeline itself, and does not design AI Moment classification, Smart Highlights, Find Me, or Every Perspective — all remain V1.1/V1.2/Later exactly as the first spec phased them.

**A note on two sections:** Lifecycle & Retention and the Security Threat Model were discussed and approved in conversation, but reconstructing this document after a context compaction meant those two sections in particular are rebuilt from reasoning rather than verbatim-recalled specifics. Give them a closer read than the rest of this doc.

## Guest Identity & Session Design

Memories does not introduce a login or account system of any kind — guests never see an authentication screen. A session is minted silently, server-side, the moment a guest opens the Memories link.

```
MemoriesGuestSession {
  eventId: string
  level: "rsvp_guest" | "anonymous"
  rsvpId?: string        // present only when level = "rsvp_guest"
  guestName?: string     // self-reported, optional, never required
  expiresAt: number
}
```

- **Anonymous** is the default and primary path: a guest scans a venue QR code or opens a shared link, and the session is minted with no identity claim beyond "this browser is looking at Mercy & John's event." The landing screen offers an optional name field ("so the couple knows who to thank") — never required, never gates upload.
- **rsvp_guest** is an opportunistic upgrade, not a separate flow: if a guest arrives already carrying a valid RSVP edit-token session from the existing invitation site (`createEditToken`/`hashEditToken`), Memories recognizes them without asking anything twice. This reuses the existing RSVP identity, it does not create a second one.
- The session is HMAC-signed using the same namespaced-prefix convention as the existing passcode sessions (`signInvitationPasscodeSession`), with its own `"memories-guest."` prefix — self-contained, no DB row, no lookup on every request. Cookie path `/`, scoped to the event's subdomain.
- This is deliberately the same trust model as everything else in the invitations module: a signed token proves "this browser was handed this session for this event," nothing more. It is not an authorization system for anything beyond upload/view of Memories for that one event.

## Data Model

All new tables are scoped by `event_id` and follow this module's existing RLS pattern (never `tenant_id` — Memories is not part of the core SiteForOwners multi-tenant site, it inherits the invitations module's own event-scoped RLS convention). snake_case, UUID primary keys, `created_at timestamptz default now()` on every table, per repo convention.

### `memory_media`

The full table; the first spec named only its five processing-status columns.

```sql
create table memory_media (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references invitation_events(id),

  -- attribution (never a foreign key to a guest-account table — none exists)
  uploader_rsvp_id uuid references invitation_rsvps(id),   -- null for anonymous uploads
  uploader_display_name text,                              -- self-reported, optional
  guest_session_level text not null check (guest_session_level in ('rsvp_guest','anonymous')),

  -- media kind and object keys (see first spec's key convention)
  media_kind text not null check (media_kind in ('photo','video')),
  object_key_original text not null unique,
  object_key_display text,       -- null until processing_status = 'ready'
  object_key_thumbnail text,     -- null until processing_status = 'ready'

  -- EXIF-derived / client-reported timestamp — the basis for Moments membership
  captured_at timestamptz,       -- from EXIF when present, else upload time
  uploaded_at timestamptz not null default now(),

  -- five independent status dimensions (first spec) — repeated here as the canonical location
  upload_status text not null default 'pending'
    check (upload_status in ('pending','uploaded','upload_failed')),
  processing_status text not null default 'pending'
    check (processing_status in ('pending','processing','ready','processing_failed')),
  moderation_status text not null default 'pending'
    check (moderation_status in ('pending','awaiting_host_review','approved','flagged','rejected')),
  ai_status text not null default 'not_started'
    check (ai_status in ('not_started','processing','enriched','ai_failed')),  -- unused until V1.1

  -- moderation detail (populated only when a moderation model actually ran)
  moderation_score numeric,           -- highest-confidence flagged category, 0-1
  moderation_categories text[],       -- e.g. {'explicit_nudity'} — for host review context, not guest-facing

  created_at timestamptz not null default now()
);

create index on memory_media (event_id, captured_at);
create index on memory_media (event_id, moderation_status) where moderation_status in ('pending','flagged');
```

`gallery_visible` remains **computed, never stored**, and is now precisely:

```
gallery_visible =
  upload_status = 'uploaded'
  AND processing_status = 'ready'
  AND moderation_status = 'approved'
```

Note this is stricter than the first spec's draft (`approved OR not_required`) — with the moderation-mode design below, `'approved'` always means "cleared to show," full stop; there is no "moderation doesn't apply" case, because the Rekognition safety net runs regardless of host-chosen mode (see Moderation Design).

### `memory_upload_sessions`

Tracks a guest's batch upload attempt client-side-driven, server-persisted so it survives a closed tab or dead connection. One row per "add your photos" batch, not per file.

```sql
create table memory_upload_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references invitation_events(id),
  guest_session_fingerprint text not null,  -- derived from the signed guest session, not PII
  total_files integer not null,
  completed_files integer not null default 0,
  failed_files integer not null default 0,
  status text not null default 'in_progress'
    check (status in ('in_progress','completed','abandoned')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Per-file state within a batch lives on `memory_media` itself (`upload_status`) — this table exists purely to answer "how far did this guest's batch get," which is what the resilient-upload UI reads on reopen.

### `memory_moments`

Host-defined, named time windows. No AI in V1 — see Moderation & Moments below for how the override table anticipates V1.1 without a schema change.

```sql
create table memory_moments (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references invitation_events(id),
  name text not null,              -- host-chosen, e.g. "Ceremony", "Dance Floor"
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
```

A photo's default Moment membership is **computed**, not stored: a photo belongs to the first `memory_moments` row (by `sort_order`) whose `[starts_at, ends_at)` contains its `captured_at`. Non-overlapping windows are a host-authoring convention, not a DB constraint — the "first match wins" rule makes overlap well-defined without needing to forbid it.

### `memory_moment_media`

Exists **only** as an explicit override to the computed default above — for V1, that means a host manually re-assigning a miscategorized or borderline photo. In V1.1, this becomes the same table an AI classification job writes to when confident. No schema change needed to add that later.

```sql
create table memory_moment_media (
  media_id uuid not null references memory_media(id),
  moment_id uuid not null references memory_moments(id),
  source text not null check (source in ('host_override', 'ai_classified')),  -- ai_classified unused until V1.1
  created_at timestamptz not null default now(),
  primary key (media_id)   -- one override per photo; the computed default is the fallback, not a second row
);
```

## Moderation Design

### Two modes, one default

Host-configurable per event, stored as a single column on `invitation_events` (or a small `memory_settings` row — implementation detail, not a design decision):

- **Auto-publish (the default).** Guest uploads appear in the gallery as soon as they clear processing and the Rekognition safety net (below) — no host action required. This is the default specifically because hosts are busy during and immediately after their own event and won't reliably work a queue.
- **Review required.** Every upload waits for explicit host approval before anyone else sees it. Available for hosts who want it, not pushed as the default.

### The Rekognition safety net (new — not in the first spec)

Because auto-publish means content can go live before any human looks at it, every upload — regardless of mode — passes through AWS Rekognition's content moderation API before `moderation_status` can become `approved`. Per the first spec's rule that the Worker never calls an AI/vision API synchronously in the derivative-generation path, this check is its own independent, non-blocking step: it runs after `processing_status` reaches `'ready'`, not as part of that same pipeline stage. A media item can therefore sit at `processing_status = 'ready'` while `moderation_status` is still `'pending'` for a brief window — the host-facing queue accounts for this (see below), it does not treat unchecked and awaiting-approval as the same thing.

- **Vendor:** AWS Rekognition (`DetectModerationLabels` for photos, the video moderation API for videos). Chosen over Google Vision SafeSearch, Sightengine, Hive, and OpenAI's free `omni-moderation-latest` specifically for its pure pay-per-call pricing (no monthly minimum — this app's usage is bursty by event, not steady traffic) and because it plausibly backs every AI feature already on the roadmap (Label Detection → V1.1 Moment classification; quality/label signals → a later Highlights feature), not just moderation. This reasoning is the rationale to preserve if the vendor is ever revisited, not just "cheapest."
- **Integration point:** the first spec reserved an `AIProvider` interface with no implementation before V1.1. Moderation becomes that interface's first real implementation, scoped initially to one method (`moderateImage()` / `moderateVideo()`); label-based classification methods are added to the same interface in V1.1 without a new integration.
- **Threshold policy** — Rekognition always runs first, in both modes, but what a "clean" result does next depends on the host's chosen mode:
  - Before the check runs: `moderation_status = 'pending'` (the column default) in either mode — this is the "not yet safety-checked" state, never shown to a host as something actionable.
  - High-confidence flagged content → `moderation_status = 'rejected'` automatically, in either mode, never enters the gallery. Host sees it in a "Removed" view for transparency but does not need to act.
  - Borderline confidence → `moderation_status = 'flagged'`, in either mode, held out of `gallery_visible`, surfaced in the host's "N flagged" queue for a manual call. This is where false positives (e.g., an artistic dress-detail shot) get caught and released by a human.
  - Clean, **auto-publish mode** → the system itself immediately transitions `moderation_status` straight to `'approved'` — no host action, this is the common case that makes auto-publish feel instant.
  - Clean, **review-required mode** → `moderation_status` transitions to `'awaiting_host_review'`, a distinct value from `'pending'` specifically so the host's queue can tell "not yet safety-checked" apart from "safety-checked and genuinely waiting on you." Only an explicit host approval action moves it from there to `'approved'`. This is what keeps "review required" meaningfully different from auto-publish — Rekognition clearing a photo never substitutes for the host's own gate in this mode.
- **Cost note to revisit at implementation time:** Rekognition's video moderation is priced per minute (~$0.10/min), materially more than photo moderation per item. If guests upload long video clips, this could be a real per-event cost line worth capping (e.g., a max clip length) rather than a decision to make now.
- **Video note:** the first spec explicitly ruled out server-side video transcoding/derivatives for V1. Consistent with that, video thumbnails in the gallery are generated **client-side** at upload time (the browser captures a frame from the `<video>` element to a canvas and uploads it as a normal image alongside the original) — this is a companion asset, not a server-side "derivative," so it doesn't reopen that decision.

### Host review queue UI

Two views depending on the event's mode, both under the same page:

**Auto-publish (default) view:**
- Tabs: **Live** / **Removed**. No "Pending" tab in the primary view — on a normal day there's nothing waiting, since only flagged items ever require action.
- Stats: Live count, Pending (flagged) count, Removed count.
- Each live item has a single **Remove** action — instant takedown, for everyone.
- A small always-visible "N flagged" affordance surfaces whenever Rekognition holds something back, so it's never buried.

**Review-required view:**
- Tabs: **Pending** / **Published** / **Rejected**. "Pending" here queries `moderation_status = 'awaiting_host_review'` specifically — a media item still sitting at raw `'pending'` (not yet safety-checked by Rekognition) is deliberately excluded, so a host is never shown something as actionable before it's actually ready for their decision.
- Bulk-select with "Approve selected" / "Reject selected" — most hosts clear this in one pass, not photo-by-photo.
- Each pending item shows uploader (or "Anonymous guest"), time, and which Moment it computed into.

Both views are the same underlying data (`memory_media` filtered by `moderation_status`/mode); the UI framing differs because what a host is doing differs — clearing an exceptions queue vs. gatekeeping everything.

## Guest Upload Experience

- **Landing:** two paths — "Add your photos" or "Just browse the gallery." An optional name field, never a gate. Aggregate counts (photos/videos/guests-so-far) shown immediately, reinforcing that no sign-in happened to get here.
- **Resilient upload queue:** client-side, persisted to **IndexedDB** (not just in-memory state), so a closed tab, refresh, or dropped connection resumes exactly where it left off rather than restarting. Per-file states visible to the guest: queued → uploading (%) → done, or → retry (with a plain-language "weak signal, nothing is lost" message rather than a technical error).
- Files upload directly to R2 via the presigned URLs from the first spec's `/api/memories/upload/init` — the guest's browser never round-trips file bytes through Vercel.
- Retry/backoff for failed chunks is the client queue's responsibility; the server only ever sees a request that either succeeds or doesn't — no partial-upload state to reconcile server-side beyond what `memory_upload_sessions` already tracks.

## Gallery UX

Two views, both guest-facing, both themed with the event's own customizable theme (matching `PublicInvitation.tsx`'s existing per-event theming) — **not** the admin plum palette, which is reserved for founder/owner screens only.

### All Photos (locked design)

- A horizontal "story strip" across the top: one ring per guest who has uploaded recently (~20 minutes), à la Instagram Stories — deliberately time-limited so it reads as "happening now," not a permanent contributor list.
- A live "N new photos just now" banner when uploads land while a guest is browsing (requires a live-update mechanism — Supabase Realtime subscription or a cheap polling fallback; an implementation-time choice, not a design one).
- The feed itself: masonry tiles (varied heights, not a uniform square grid — deliberately chosen over a flat grid to avoid a "file browser" feel), grouped under time-of-day section headers ("Tonight," "This afternoon") rather than one undifferentiated scroll.
- **No reactions/likes in V1.** Considered and explicitly deferred — there is no `likes`/reactions table, and adding one raises a moderation question (can guests spam-react?) that hasn't been scoped. A candidate V1.1 feature, not a V1 gap.

### Moments (Discovery)

- One card per `memory_moments` row: name, time range, computed photo count, a representative cover image.
- Tapping in shows that Moment's photos in the same masonry treatment as All Photos.
- **No AI Highlights, no Every Perspective, no Find Me tab in V1** — all three appear in the source UX reference material but are explicitly out of scope; the bottom navigation is only **All Photos** / **Moments**.

### Explicitly excluded from V1 (repeated here for a single source of truth)

AI-driven Moment classification (V1.1, override table ready now), Smart Highlights (Later — same Rekognition signals under consideration), Find Me / selfie search (V1.2), Every Perspective cross-guest clustering (V1.2), reactions/likes (candidate V1.1), video transcoding/derivatives (first spec, unchanged), duplicate-photo detection (V1.1).

## Host Dashboard

A "Memories" card alongside the existing Responses and Message Guests cards on the owner/founder dashboard (admin plum palette, matching those two):

- A thumbnail strip of the most recent uploads — keeps the card feeling alive without opening the full gallery.
- Photo / video / guest-contributor counts.
- A conditional **"N flagged"** badge — present only when Rekognition has actually held something back; absent on a normal day.
- Two actions: **View gallery** (opens the guest-facing view) and **Review flagged** (opens the host queue above) — the second button's label and emphasis shift to plain "Manage" when nothing is flagged.

## Lifecycle & Retention

*(Reconstructed for this write-up — confirm this matches what was actually discussed.)*

- **Upload window:** open from event creation through a configurable period after the event date (default proposed: 14 days) — long enough for guests to upload photos they didn't get around to sending the night of, without the upload surface staying open indefinitely.
- **Gallery availability:** the gallery itself stays viewable well beyond the upload window (default proposed: 12 months from the event date) before any consideration of archival — this is a keepsake feature, and premature takedown would undermine the product's core value.
- **At expiry:** originals are not deleted automatically in V1 — retention/deletion policy is a founder-level decision to make deliberately later (and a candidate spot for a paid "permanent archive" upsell, already named as a Later-phase idea in the first spec), not something this spec should silently decide by omission.
- **Scheduled enforcement:** follows the existing Vercel Cron pattern (`send-reminders`), one daily due-check job that closes the upload window when its date passes — no new scheduling system.

## Security Threat Model

*(Reconstructed for this write-up — confirm this matches what was actually discussed.)*

- **Guest session forgery:** `MemoriesGuestSession` is HMAC-signed with its own namespaced prefix; a forged or tampered cookie fails signature verification and is treated as no session (falls back to anonymous, not an error) — same trust model already proven by the existing passcode-session mechanism.
- **Cross-event data leakage:** every table above carries `event_id` and is RLS-scoped by it; a guest session for event A can never read or write `memory_media` for event B, enforced at the database layer, not just in application code.
- **Moderation bypass:** `moderation_status` is never client-settable — it is written only by the backend processing pipeline (the async Rekognition step, separate from the derivative-generation Worker per the note above), the review-queue API (host actions, gated by the existing `requireInvitationAccess`), or the DLQ-drain/retry path. No guest-facing route can set it directly.
- **Abusive/excessive uploads:** rate-limited per guest session (a cap on files per session per time window, mirroring the existing per-event SMS/email notification caps' shape, not their exact numbers) and per-event storage quota, so a single malicious or buggy client can't exhaust an event's storage or flood the moderation queue.
- **PII in media:** EXIF/GPS is stripped as a side effect of the existing decode-resize-re-encode step (first spec) before any derivative is guest-facing; originals retain EXIF but are never guest-accessible, only host-downloadable via short-lived signed URLs.
- **Storage URL guessing:** object keys are UUID-derived (`{mediaId}.{ext}`), unguessable, and originals live in a bucket with no public read access — every access is a signed URL issued after an authorization check, matching `direct-media.ts`'s existing pattern.
- **Privilege surface:** the host review queue and dashboard reuse `requireInvitationAccess` unchanged — Memories introduces no new admin role, session type, or privilege level beyond guest vs. owner/founder, which already exist.
- **Face data boundary:** repeating the first spec's standing constraint — if V1.2 Find Me is ever built, face data must never cross event boundaries. Not relevant to any V1 code path, but worth restating here since this is the spec that would otherwise be the last checkpoint before implementation begins.

## Deferred Scope (updated)

Still explicitly out of this spec and V1:

- AI Moment classification, Smart Highlights, duplicate-photo detection (V1.1)
- Find Me (face search), Every Perspective (V1.2)
- Video highlight reels, live photo wall, photo challenges, voice/video guestbook, permanent archive upsell (Later)
- Reactions/likes (candidate V1.1, not committed)
- Detailed observability/cost-tracking event schema — the moderation/upload/storage metrics named above (flagged-rate, success/failure rates, per-event storage) are noted as worth tracking, but their concrete event shape belongs in the implementation plan, not this design doc

These, plus the two flagged-for-confirmation sections above, are what to raise before this moves to `writing-plans`.
