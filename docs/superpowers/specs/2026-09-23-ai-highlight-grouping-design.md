# AI Highlight Grouping Design

## Goal

Give AI Highlights its own semantic grouping system instead of reusing host-defined, timestamp-based Moments. Hosts may optionally define the highlight groups for an event. Without host configuration, the system derives useful groups from the event's media and falls back to a small general-purpose dictionary while there is not enough media to form stable event-specific groups.

Timestamp-based Moments remain unchanged. AI Highlights must never read from or write to Moment membership.

## Product behavior

### Automatic mode

Automatic mode is the default for an event.

- With fewer than eight approved media items, AI Highlights uses general fallback groups such as ceremony, cake, dancing, food and drinks, decorations, group photos, children, gifts, and send-off. Only groups with matching media are shown.
- At eight approved media items, the system derives four to eight event-specific groups from the complete collection of stored media descriptors.
- The system re-evaluates the collection after each additional batch of ten approved media items.
- Regeneration preserves the identifiers, host-edited names, ordering, and visibility of materially equivalent existing groups whenever the generator returns the same semantic key, so guest-facing navigation remains stable.
- A media item may belong to multiple highlight groups.
- Media without useful descriptors remains visible in Gallery and timestamp-based Moments but is omitted from AI Highlights.

### Host-defined mode

Hosts can replace automatic groups with their own groups. Each group has:

- a required name;
- an optional description that gives the classifier semantic context;
- a display order;
- a visible or hidden state.

When at least one host-defined group exists and host-defined mode is active, automatic and fallback groups are not displayed. AI classifies media into any number of matching host groups. Hosts do not need to provide keywords.

Hosts can rename, reorder, hide, or delete their groups. Switching from automatic to host-defined mode triggers classification against the host groups. Switching back to automatic mode triggers automatic regeneration.

### Existing events

Existing images do not retain the labels used by the current one-shot classifier. The host management portal therefore provides a **Generate AI Highlights** action.

The action queues descriptor extraction for existing approved media, displays progress, and publishes the completed highlight set atomically. It does not automatically reprocess every production event during deployment. New uploads participate automatically after the feature is deployed.

### Guest experience

Guests see only the last successfully published highlight set. A generation or regeneration in progress does not expose partial groups. When no published groups exist, the existing empty state remains available.

## Data model

Add a migration after `057_memory_media_contributor_session.sql` with four concerns kept separate.

### `memory_media_descriptors`

Stores reusable AI input for a media item.

- `media_id uuid primary key references memory_media(id) on delete cascade`
- `descriptor_version text not null`
- `labels jsonb not null default '[]'`
- `embedding jsonb null`
- `transcript_cues jsonb null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

For images, `labels` contains normalized provider labels and confidence. The other fields remain nullable. Future video processing can add labels from representative frames, an embedding, and transcript cues without changing highlight membership APIs.

### `memory_highlight_groups`

Stores automatic, fallback, or host-defined group definitions.

- `id uuid primary key default gen_random_uuid()`
- `event_id uuid not null references invitation_events(id) on delete cascade`
- `name text not null`
- `description text null`
- `semantic_key text not null`
- `source text not null check (source in ('fallback', 'ai_generated', 'host_defined'))`
- `sort_order integer not null default 0`
- `is_visible boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

The tuple `(event_id, source, semantic_key)` is unique. A stable semantic key lets regeneration reuse a group while preserving host edits to its display name, order, and visibility. Host-defined groups are owned by the event and are never modified by automatic regeneration.

### `memory_highlight_generations`

Tracks one complete classification attempt and provides the atomic publication boundary.

- `id uuid primary key default gen_random_uuid()`
- `event_id uuid not null references invitation_events(id) on delete cascade`
- `mode text not null check (mode in ('fallback', 'automatic', 'host_defined'))`
- `status text not null check (status in ('queued', 'processing', 'published', 'failed'))`
- `media_count integer not null default 0`
- `error_code text null`
- `created_at timestamptz not null default now()`
- `published_at timestamptz null`

Only one queued or processing generation may exist per event. Failed generations remain available for host status and operational debugging until routine cleanup.

### `memory_highlight_media`

Stores many-to-many membership.

- `group_id uuid not null references memory_highlight_groups(id) on delete cascade`
- `media_id uuid not null references memory_media(id) on delete cascade`
- `generation_id uuid not null references memory_highlight_generations(id) on delete cascade`
- `confidence numeric null`
- `created_at timestamptz not null default now()`
- primary key on `(generation_id, group_id, media_id)`

The schema permits a photo or future video to appear in multiple groups.

### Event-level configuration and generation state

Extend Memories settings with:

- `highlight_mode text not null default 'automatic' check (highlight_mode in ('automatic', 'host_defined'))`
- `published_highlight_generation_id uuid null`
- `pending_highlight_generation_id uuid null`
- `highlight_generation_status text not null default 'idle' check (highlight_generation_status in ('idle', 'queued', 'processing', 'failed'))`
- `highlight_generation_error text null`
- `highlight_last_generated_media_count integer not null default 0`

The published generation identifier is the atomic read boundary. Guest queries return only memberships belonging to that generation and their visible groups. This rule applies equally to automatic and host-defined modes.

The existing `memory_moments` and `memory_moment_media` tables remain untouched for backward compatibility with timestamp Moments. New AI Highlight code must not depend on them.

## Classification architecture

### Descriptor extraction

After moderation approves an upload or places it into host review, the enrichment pipeline extracts labels once and upserts `memory_media_descriptors`. Descriptor extraction is idempotent and versioned. A version change can deliberately queue a new extraction later.

The classifier accepts a provider-independent descriptor:

```ts
interface MemoryMediaDescriptor {
  mediaId: string;
  mediaKind: "photo" | "video";
  labels: Array<{ name: string; confidence: number }>;
  embedding?: number[];
  transcriptCues?: string[];
}
```

Current photo support supplies labels. Future video support supplies representative-frame labels and may add transcript cues or embeddings through the same interface.

### Fallback classification

For fewer than eight approved descriptors, a general dictionary maps normalized labels to fallback highlight definitions. The dictionary is not tied to wedding schedule terminology and does not inspect Moments. Scoring supports multiple matching groups and uses a minimum confidence threshold to avoid weak assignments.

Fallback groups are created only when at least one media item matches them.

### Dynamic group generation

At the eight-item threshold, and for explicit regeneration, a server-side generator receives a compact representation of all approved descriptors. It returns structured group proposals with names, descriptions, and media assignments.

The generation contract must:

- produce four to eight distinct, guest-friendly groups;
- permit multiple group assignments per media item;
- exclude unsupported media IDs;
- avoid sensitive, demeaning, or identity-inference category names;
- merge synonymous or materially overlapping groups;
- preserve existing group identities when the semantic match is strong;
- return validated structured output before database writes begin.

The first implementation uses the project's existing Anthropic SDK and `ANTHROPIC_API_KEY`, with strict JSON validation for naming and assignments. Raw original media is not sent repeatedly; the generator consumes stored descriptors. An internal provider interface isolates Anthropic so the model or vendor can change without changing repositories or UI.

### Host-defined classification

The classifier receives host group names and optional descriptions plus the stored descriptors. It may assign each item to zero, one, or multiple groups. Host groups replace automatic groups for guest display rather than augmenting them.

## Generation lifecycle

1. Create a generation identifier and mark the event `queued`.
2. Queue missing descriptor extraction jobs for eligible approved media.
3. Wait until the generation's required descriptor jobs reach a terminal state.
4. Select fallback, dynamic, or host-defined classification according to event mode and media count.
5. Validate all proposed groups and assignments.
6. Reuse groups with matching semantic keys, create new definitions where necessary, and write memberships tagged with the pending generation.
7. In one database transaction, set the pending generation as published, update the generated media count, clear the error, and mark the event idle.
8. Delete obsolete automatic generations after publication. Never delete host-authored group definitions as part of automatic cleanup.

Automatic regeneration is queued when the event is in automatic mode and the approved descriptor count reaches eight or grows by ten beyond `highlight_last_generated_media_count`. Only one pending generation may exist per event.

## API and repository boundaries

Add focused repository methods for:

- listing and upserting descriptors;
- managing host highlight groups;
- starting, failing, and atomically publishing a generation;
- writing many-to-many memberships;
- returning only the published guest highlight set;
- reporting host-visible generation progress.

Host routes require existing invitation owner/co-host authorization. Internal enrichment and generation routes require `MEMORIES_INTERNAL_SECRET`. Public gallery routes remain read-only and return a separate `highlights` payload rather than overloading `moments` or `momentId`.

`PublicMemoryMedia.momentId` remains a Moment concern during the transition. AI Highlight UI will move to the new published highlight response and stop calling `aiHighlightGroups(media, moments)`.

## Host UI

The Memories management page adds an AI Highlights section containing:

- mode selection: Automatic or Host-defined;
- **Generate AI Highlights** or **Regenerate** action;
- progress and last-published status;
- retryable error state;
- automatic group preview with rename, reorder, and hide controls;
- host-defined group creation with required name and optional description;
- deletion and ordering controls.

Renaming or hiding an automatic group is preserved during later regeneration when that group is semantically retained. Regeneration requires an explicit host action for existing events; threshold-based updates apply after the first published generation.

## Error handling and safety

- A failed descriptor or generation job records a concise host-visible error and retains the previous published generation.
- Invalid or malformed AI output is rejected before any guest-visible data changes.
- Duplicate queue delivery is safe because descriptor writes, generation creation, and membership writes are idempotent.
- Deleted or rejected media is excluded from new generations; foreign keys remove stale memberships.
- Empty or low-signal output publishes no new generation and preserves the previous one.
- Automatic regeneration never changes timestamp Moments.
- Logs contain event and generation identifiers but no raw image content or guest personal information.

## Testing

Unit tests cover:

- general fallback classification without Moment input;
- zero, one, and multiple highlight memberships per media item;
- the eight-item dynamic-generation threshold and ten-item regeneration interval;
- host-defined groups replacing automatic groups;
- name-plus-description classification input;
- semantic group stabilization across regeneration;
- descriptor compatibility for photo and future video inputs;
- validation of malformed or unsafe generated groups.

Repository and route tests cover:

- many-to-many persistence and cascade behavior;
- authorization for host management routes;
- internal-secret enforcement for processing routes;
- atomic publication and preservation of the prior generation on failure;
- idempotent retries and duplicate queue delivery;
- public responses returning only the published generation.

Component tests cover:

- host mode selection and custom group editing;
- generation progress, success, failure, and retry states;
- guest rendering of multi-group media;
- AI Highlights remaining independent from timestamp Moments.

The existing complete Memories suite, TypeScript validation, and production build must remain green.

## Rollout

Delivered across eight tasks, each merged after independent review:

1. Apply the additive migrations — `058_memory_highlight_grouping.sql` (the four new tables: `memory_media_descriptors`, `memory_highlight_groups`, `memory_highlight_generations`, `memory_highlight_media`, plus event-level mode/state columns) and `059_memory_highlight_missing_descriptors_rpc.sql` (a follow-up fix for the cross-event descriptor-backfill query, which had stopped finding work once the platform's oldest 200 approved media rows were all already described — replaced with a real `LEFT JOIN ... WHERE IS NULL` RPC, `list_approved_media_missing_descriptors_across_events`, plus a supporting partial index).
2. Deploy descriptor persistence and generation APIs without changing the guest UI.
3. Enable automatic descriptors for new uploads (descriptor extraction now runs synchronously at moderation approval, alongside the moderation route's existing Rekognition call).
4. Deploy host controls and the explicit existing-event generation action.
5. Switch AI Highlight guest reads to published highlight generations.
6. Validate production generation on one test event before enabling it broadly (see the smoke test below).
7. Remove the old, superseded AI-to-Moment classifier (`moment-classification.ts`) and the guest-only `momentId` override projection once the above is verified in production. **Done** — the classifier and its override-loading call site are deleted; `memory_moment_media` itself is intentionally left in the database, unused by any code path, in case a future host manual-override feature wants it.

No existing Moment data is deleted or repurposed; timestamp-based Moments (`memory_moments`) are untouched throughout.

### Required environment variables

- `ANTHROPIC_API_KEY` — the generator (`highlight-generator.ts`) calls the project's existing Anthropic SDK to name and assign semantic groups from stored descriptors. Without it, generation processing fails per-item (logged, non-fatal to the cron batch) and the previous published generation is retained.
- `AWS_REGION` — passed to the Rekognition client (`ai-provider.ts`) used for descriptor extraction; defaults to `us-east-1` if unset.
- `CRON_SECRET` — Bearer-token auth for `/api/cron/memories-highlights`, following the same convention as the project's other cron routes (`memories-dlq-drain`, `send-reminders`, `send-review-requests`).

### Cron schedule

`vercel.json` registers:

```json
{ "path": "/api/cron/memories-highlights", "schedule": "*/5 * * * *" }
```

Every five minutes, the route runs two bounded passes in one invocation: (1) claim and process up to 3 queued highlight generations (`listQueuedHighlightGenerations` → `processHighlightGeneration`), then (2) backfill descriptors for up to 5 approved-but-undescribed media items platform-wide, for media that predates this feature or whose synchronous extraction previously failed. The actual worker logic lives in `runMemoriesHighlightsCron` (`src/app/api/cron/memories-highlights/memories-highlights-cron.ts`); `route.ts` itself is a thin wrapper that only does Bearer auth and calls it — see the build-failure note below for why.

### Host-triggered generation procedure

For an existing event, a host uses the **Generate AI Highlights** / **Regenerate** control in the Memories admin panel (`OwnerHighlightsManager.tsx`), which calls:

```
POST /api/invitations/events/[eventId]/memories/highlights/generate
```

This queues a highlight generation (or reports the one already pending) via `resolveHighlightGenerationRequest`; the cron worker above picks it up on its next run (within 5 minutes) and publishes atomically on success, preserving the prior published generation on failure. New uploads after this feature shipped get descriptors automatically at moderation approval and need no manual backfill.

### Incident fixed during implementation: `route.ts` files must only export HTTP handlers

Two files in this feature — `src/app/api/cron/memories-highlights/route.ts` (`runMemoriesHighlightsCron`) and `src/app/api/memories/events/[eventId]/highlights/route.ts` (`getGuestHighlightsForEvent`) — originally exported their DI-seam worker/read-model function directly from `route.ts`, for the same reason `generate-request.ts` exists: this codebase's `tsx --test` convention has no way to inject fakes for a route handler's dependencies except by exporting a plain function alongside it. Next.js's typed-routes build step rejects any `route.ts` export other than the recognized HTTP handlers (`GET`/`POST`/etc.) and a small set of config fields (`dynamic`, `revalidate`, ...), so both files failed `next build` outright ("... is not a valid Route export field") while still passing `tsc --noEmit` and every test — `tsc --noEmit` only sees this class of error once `.next/types` has been generated by an actual build, so a fresh checkout's typecheck is a false green.

Fixed by extracting each function (and its dependency/result interfaces) into a sibling non-`route.ts` file — `memories-highlights-cron.ts` and `guest-highlights.ts` respectively — mirroring the split this plan already used correctly for `generate/route.ts` + `generate-request.ts`. Each `route.ts` now exports only its HTTP handler, which imports and calls the sibling function with no arguments; each route's own test file imports the DI-injectable function from the new sibling module instead. A repo-wide sweep of every `route.ts` under `src/app/api` (`grep` for `^export` members outside the standard handler/config allowlist) found no other occurrence.

**Lesson:** `npx tsc --noEmit` alone is not sufficient evidence that a route file is deployable — `npm run build` (which regenerates `.next/types` and re-typechecks against it) must be run and confirmed green before treating any route.ts change as done, matching this codebase's established incident history around checks that pass in isolation but fail the real build.

### Production smoke test

Run once against a real (non-seed) event before considering the rollout complete:

1. Create or choose an event with several approved photos spanning at least two distinct subjects (e.g. cake and dancing).
2. As the host, click **Generate AI Highlights**.
3. Wait for the generation to reach published status (progress/last-published status shown in the host panel; typically within one 5-minute cron tick).
4. As a guest, open the AI Highlight tab and verify at least one photo appears in more than one semantic group.
5. Open the Moments tab and confirm it still groups purely by timestamp (unaffected by the AI Highlight generation above).
6. As the host, switch to host-defined groups (create at least one) and verify the automatic/fallback groups disappear from the guest AI Highlight tab, replaced by the host-defined group(s).
