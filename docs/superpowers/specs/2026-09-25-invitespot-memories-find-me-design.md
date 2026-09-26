# InviteSpot Memories — "Find Me" Design

**Status:** Approved for planning (brainstorming complete 2026-09-25)

## Summary

Let a guest find every approved photo/video they personally appear in, across an event's gallery, using a one-time selfie compared against the gallery via AWS Rekognition face-matching. No login, no account, no persistent biometric data anywhere: the selfie is compared live and discarded, never written to the database or object storage. This is the last of the "discovery" features recommended by the external product feedback, deliberately built last — after Gallery, Moments, AI Highlights, Every Perspective, photo detail, and share are all in place — per that feedback's own explicit recommendation to treat face-matching as a later, privacy-sensitive feature.

## Background

This app has no guest login or account system anywhere, by design — guests are anonymous by default, optionally giving a free-text display name, sometimes linked to an RSVP via a session cookie. Find Me must work within that constraint: it cannot ask a guest to register, and it must not introduce a persistent guest identity tied to their face.

Earlier in this project, direct analysis of real production Rekognition labels ("Bride"/"Bridegroom"/"Portrait") showed these are not reliable single-person-presence signals — they're whole-scene descriptors, not identity detectors. Genuine "which photos is this specific person in" requires real face-matching, not label-based heuristics. This spec is that face-matching feature, scoped narrowly enough to avoid the privacy costs a full biometric system would otherwise carry.

## Consent and host opt-in

Find Me is off by default for every event. A host must explicitly enable it — a new toggle alongside the existing `memories_enabled`/`memories_mode` settings, in the same host settings panel. The host is the one who decided who's on the guest list and knows the event; they're better positioned than a platform-wide default to decide whether face-matching over their guests' photos is appropriate.

At the point a guest actually uses Find Me, they see explicit copy before submitting anything: their photo is compared against this event's photos to find ones they're in, then deleted immediately — it is never saved. No separate checkbox; the disclosure sits directly on the capture screen, matching this app's existing light-touch consent style (no cookie-banner-style friction elsewhere in the product).

## Data model

Two additive columns, no new tables:

- `invitation_events.find_me_enabled boolean not null default false` — the host toggle.
- `memory_media.has_faces boolean not null default false` — set once per photo/video-poster, the first (and only) time it's moderated. This is a presence flag only ("does this image contain at least one detected face"), not biometric data — no embeddings, no face IDs, nothing tied to any specific person's identity is ever stored. It exists purely to let Find Me searches skip photos that can't possibly match (venue, food, decor shots), bounding cost.

No guest-identity data is stored at all. A guest's selfie exists only in server memory for the duration of one HTTP request, is sent to Rekognition's `CompareFaces` API as request bytes, and is discarded the moment the response returns. It is never written to Supabase, never written to R2, never logged.

## Matching pipeline

Extends the existing `AIProvider` interface (`src/lib/invitations/memories/ai-provider.ts`, currently `moderateImage`/`detectLabels`) with two new methods, following the same shape and the same real-`RekognitionAIProvider`-vs-fake-in-tests pattern already established:

- `detectFaces(bytes: Uint8Array): Promise<boolean>` — wraps Rekognition's `DetectFacesCommand`; returns whether at least one face was detected. Called once per photo/video-poster at the exact point `moderate-media.ts` already fetches the image bytes for moderation — this adds one more Rekognition call to an existing code path, not a new fetch or a new pipeline stage.
- `compareFaces(sourceBytes: Uint8Array, targetBytes: Uint8Array, similarityThreshold: number): Promise<number>` — wraps Rekognition's `CompareFacesCommand`; returns the highest similarity score found between the source face and any face in the target image (0-100), or 0 if no match clears Rekognition's own internal face-detection threshold in the target.

New endpoint: `POST /api/memories/events/[eventId]/find-me`. Request body carries the selfie as raw image bytes (same content-type-based handling this app's other image endpoints already use). Behavior:

1. 404 if the event doesn't have `find_me_enabled`, or Memories itself isn't enabled (mirrors the gate the gallery/nearby endpoints already apply).
2. Rate-limit check (see below); 429 if exceeded.
3. Query gallery-visible media for the event where `has_faces = true`, capped at the 300 most recent such items — a hard ceiling so no single search can trigger unbounded Rekognition calls or unbounded guest-perceived latency, regardless of event size.
4. Compare the selfie against each candidate with bounded concurrency (5 at a time), calling `compareFaces(selfie, candidateBytes, 80)` for each — 80 is Rekognition's own commonly-recommended threshold for a confident single-person match, not a made-up number.
5. Return every candidate whose result exceeds 0, as the standard `PublicMemoryMedia[]` shape, sorted by similarity descending.

## Rate limiting

A Find Me search is far more expensive than a normal page load — up to 300 Rekognition `CompareFaces` calls in one request, against another guest's uploaded content. It needs its own cap, independent of any general per-request rate limiting this app already has. The implementation plan must locate and reuse whatever generic per-guest-session (or per-IP) rate-limiting mechanism already exists in this codebase (this app already has per-event submission/notification limits and upload quotas; the plan should identify the closest existing pattern rather than inventing a new one) and apply a cap of **5 searches per guest session per 24 hours** — enough for a guest to retry a poorly-lit or blurry selfie a few times, not enough to be a meaningful cost/abuse vector.

## Guest UX

A "Find yourself" banner/button appears inside the existing Gallery tab (`GuestGalleryView.tsx`), visible only when the event has `find_me_enabled` — not a new bottom-nav tab, since this is an occasional action a guest takes once or twice, not a browsing surface they'd return to repeatedly like Gallery/Highlights/Moments.

Tapping it opens a dedicated full-screen flow (a new component): consent copy, then selfie capture (a file input with `capture="user"` to prefer the front camera on mobile, matching how this app's other file inputs already work, with a plain file-picker fallback), then a brief loading state while the search request is in flight, then results.

Results render using the exact same masonry grid and `MediaLightbox` component already built for Gallery/AI Highlights — no new grid or lightbox code, just a new data source (the find-me endpoint's response) feeding the existing ones. An empty result set shows a plain "No matches found" message, not an error — a guest not appearing in any approved photo is an expected, non-error outcome.

## Non-goals

- No persistent face data of any kind — no Rekognition Face Collections, no embeddings, no guest-face storage across searches or sessions. Each search is a one-time, from-scratch comparison.
- No guest login/account system introduced anywhere.
- No new bottom-nav tab.
- No attempt to identify guests in videos beyond their poster frame (consistent with how the rest of this app's AI pipeline already treats video — poster-frame-only).
- No retention of search results server-side; the guest's browser holds them only for the current session.

## Testing

- `detectFaces`/`compareFaces` on `RekognitionAIProvider` are thin AWS SDK wrappers, tested the same way `moderateImage`/`detectLabels` already are (fake/stub provider injected in tests, no live AWS calls).
- The find-me route's filtering/sorting/threshold logic is pure and unit-testable directly with fixed similarity scores, independent of any real Rekognition call.
- The route itself follows this codebase's established `route.ts`-can-only-export-handlers convention — logic lives in a sibling file the route imports, consistent with every other route this session has touched.
- `has_faces` population is verified the same way this codebase already verifies `createAdminClient()`-backed writes with no injection seam: a structural source-assertion test, not a live database round trip (this environment has no live Supabase credentials wired up for automated tests).
