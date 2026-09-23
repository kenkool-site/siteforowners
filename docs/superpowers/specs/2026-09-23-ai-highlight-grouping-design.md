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

1. Apply the additive migration.
2. Deploy descriptor persistence and generation APIs without changing the guest UI.
3. Enable automatic descriptors for new uploads.
4. Deploy host controls and the explicit existing-event generation action.
5. Switch AI Highlight guest reads to published highlight generations.
6. Validate production generation on one test event before enabling it broadly.

No existing Moment data is deleted or repurposed. The old AI-to-Moment classifier can be removed only after the new guest and processing paths are verified in production.
