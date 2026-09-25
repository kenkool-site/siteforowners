# InviteSpot Memories — Video Support Design

## Goal

Let guests upload short video clips alongside photos in the existing Memories feature, moderated and displayed through the same pipeline photos already use wherever possible. Photo behavior is unchanged; this spec only adds a second `mediaKind` path through upload, moderation, AI Highlights, and guest-facing display.

Confirmed non-goal for this pass, not just deferred by omission: server-side video transcoding/derivatives. The original spec (`2026-09-20-invitespot-memories-processing-design.md:197`) already ruled this out after research — nothing Workers-native handles it well today. The uploaded original *is* the playback file.

## Product behavior

- **Limits:** 60 seconds, 50MB per clip — matches the only other video path in this codebase (`direct-media.ts`'s host-asset video cap), so this isn't a new precedent. Duration is checked client-side before upload starts (no point uploading 50MB to reject it after); size is enforced server-side exactly like photos are today.
- **Accepted formats:** `video/mp4`, `video/webm`, `video/quicktime` (.mov). QuickTime is included deliberately — it's iPhone's default camera format, and this codebase already has one disclosed gap (HEIC on the photo side) from not covering it; `upload-tickets.ts`'s `EXTENSION_BY_CONTENT_TYPE` already maps all three, unused today only because `upload/init` currently hard-rejects `mediaKind: "video"` before reaching it.
- **Moderation depth:** the poster frame only, not the full clip. Rekognition's synchronous image-moderation API (used for photos) accepts raw bytes; its video API (`StartContentModeration`) does not — it only accepts a reference to a file already sitting in a real AWS S3 bucket, which this app doesn't use (storage is Cloudflare R2). Moderating the poster keeps this pass to zero new AWS infrastructure and reuses the existing, already-working synchronous pipeline unchanged. The gap — content appearing only later in the clip isn't inspected — is accepted for a private wedding-guest audience and disclosed in Deferred Scope below, not hidden.
- **Playback:** grids (Gallery, Moments, AI Highlights) show the poster frame as the thumbnail with a small play-badge overlay. Tapping opens the existing shared lightbox with a real `<video controls>` element playing the original file. No autoplay-in-grid — matches how photos already behave (tap-to-view), and avoids every guest's device silently streaming several videos while just scrolling.

## Data model

**No new column, no new table.** `memory_media` already has `object_key_display` and `object_key_thumbnail` (`056_invitation_memories_foundation.sql:26-27`), both nullable, both currently populated later by the processing Worker for photos. For video there is no Worker step at all (see Processing below) — both are populated synchronously at upload-complete time instead:

- `object_key_thumbnail` → the poster JPEG's key.
- `object_key_display` → the same key as `object_key_original` (the video itself; "display" for video means "play the actual clip").

This means the two existing media-serving routes (`src/app/api/memories/media/[mediaId]/[variant]/route.ts` and its host-facing counterpart under `.../events/[eventId]/memories/media/...`) need **zero code changes** — they already resolve `objectKeyDisplay`/`objectKeyThumbnail` generically regardless of media kind.

`MediaKind` (`types.ts`) already includes `"video"` throughout the type system (descriptors, upload tickets) — this pass makes it reachable, not new.

## Upload flow

1. **Poster key derivation:** a new pure function alongside `objectKeyForOriginal` in `upload-tickets.ts` — `objectKeyForVideoPoster(eventId, mediaId) => \`originals/${eventId}/${mediaId}-poster.jpg\`` — deterministic from ids alone, always `.jpg` regardless of the video's own format.
2. **`upload/init`:** drop the `mediaKind === "video"` 400 rejection and widen `ALLOWED_CONTENT_TYPES` to include the three video types. When `mediaKind === "video"`, the response includes a second presigned PUT URL (`posterUploadUrl`) for the poster key above, alongside the existing `uploadUrl` for the video itself. The poster URL needs no separate signed ticket of its own — R2's presigned-URL scoping already authorizes the write the same way the video's own URL does; the ticket verified at `/complete` is what authorizes the *status flip*, not the storage write.
3. **Guest browser:** after picking or recording a video, draws a frame from the `<video>` element to a canvas, exports it as a JPEG blob, and — for a video item — uploads *both* files (video to `uploadUrl`, poster to `posterUploadUrl`) before calling `upload/complete`.

   This needs one real interface change, not just a call-site tweak: `upload-queue.ts`'s resilient, IndexedDB-persisted queue (`QueueItem`, `UploadQueue.enqueue`, `UploadOneFn`, and the internal `PersistedEntry`) is built around exactly one `File` per queue item today. Extend it to carry an optional second blob (`posterFile?: File` alongside `file: File` in `PersistedEntry`; `enqueue(file: File, posterFile?: File)`; `UploadOneFn` gains a `posterFile: File | undefined` parameter) rather than modeling video as two separate queue entries. IndexedDB can store a second `Blob`/`File` in the same persisted record with no new mechanism — this keeps the existing "one guest-visible row, one retry action, resilient across a page reload" model intact for video exactly as it already works for photos, instead of a guest ending up with two linked-but-separate rows (poster succeeded, video failed — now what does the UI show?) if it were split into two items. `GuestUploadView.tsx`'s own upload handler currently hardcodes `mediaKind: "photo"` in its `upload/init` call (`GuestUploadView.tsx:20`) and restricts its file input to image MIME types — both need to branch on the picked file's actual type instead.
4. **`upload/complete`:** request shape is unchanged (`{mediaId, ticket}`). For a video mediaId, before flipping `upload_status`, it additionally does an R2 `HEAD` on the poster key and fails the call (without flipping status) if it's missing. This check exists because photos have a safety net the video path doesn't: a missing/corrupt photo original gets caught by the processing Worker and dead-lettered; video has no Worker step at all, so a missing poster would otherwise surface later as a silently broken thumbnail with nothing ever retrying it. On success, sets `object_key_display`/`object_key_thumbnail` as described above and `processing_status = 'ready'` directly — video never enters the `memory_processing_jobs`/DLQ retry system.

## Moderation and AI Highlight integration

`/api/memories/moderate` (already the single moderation entry point for both the host-approval path and the automatic post-upload path) branches on `mediaKind`:

- **Photo (unchanged):** downloads the moderation-derivative JPEG, runs `DetectModerationLabels`.
- **Video (new):** downloads the poster JPEG (already sitting at `object_key_thumbnail`), runs the *same* `DetectModerationLabels` call against it. The approve/flag/reject outcome logic, `updateMemoryMediaModeration`, and the host review queue are all shared code paths — no branching needed past this point.

Immediately after, the route's existing best-effort `DetectLabels` + `upsertMemoryMediaDescriptor` + `requestHighlightGeneration` sequence runs on that same poster frame for video too. This is not new work — it's the same calls already made for photos, pointed at the poster instead of a photo derivative — and it means video items become full AI Highlight participants (groupable, multi-group-capable) with no additional code in `highlight-classifier.ts`/`highlight-generator.ts`. `MemoryMediaDescriptor.mediaKind` already supports `"video"`; this is the first thing that ever sets it.

The host review queue (`OwnerMemoriesReviewQueue.tsx`) needs no changes to function — it already renders whatever `.../thumbnail` returns, which will correctly be the poster. A play-badge or duration indicator on review-queue thumbnails would be a nice-to-have, not required for this pass.

## Processing

Video does not enter the photon-rs-based processing Worker pipeline at all. That pipeline exists specifically to decode/resize/re-encode photos (and strips EXIF as a side effect); video has no equivalent step in this design (no transcoding, confirmed non-goal above). `processing_status` for video goes straight to `'ready'` at `upload/complete`, synchronously — there is no R2-event-triggered Worker invocation, no job row, no retry/DLQ path for video uploads.

## Guest-facing display

- **Grids:** `GuestGalleryView.tsx`, `GuestMomentsView.tsx`, `GuestAiHighlightView.tsx` — each already renders an `<img src=".../thumbnail">` per item generically. For a video item this correctly shows the poster already; each needs one small addition — a play-badge overlay (a small centered icon) rendered when `item.mediaKind === "video"`, matching this module's existing icon usage (`lucide-react`, already a dependency).
- **Lightbox:** `MediaLightbox.tsx` currently renders a plain `<img>`. Extended to render `<video controls src={".../display"}>` instead when the current item's `mediaKind === "video"` — swipe/drag navigation between items is unaffected (it operates on the container, not the media element type), but the swipe gesture handlers currently attached directly to the `<img>` need to also attach to the `<video>` element for the same tap-and-drag behavior to work on video items. Playback does not start automatically; the guest taps the video's own native controls.
- **Public API shape:** `PublicMemoryMedia` (`gallery.ts`) already carries `mediaKind`; no new field needed — `objectKeyDisplay`/`objectKeyThumbnail` already round-trip through the existing shape.

## Error handling and safety

- Oversized or wrong-format video is rejected at `upload/init` with the same 400 pattern already used for photos (specific, guest-readable error message).
- A guest's browser failing to capture a poster frame (e.g., a codec the browser can decode for playback but not seek/draw-to-canvas, a rare but real gap) must not silently produce a video with no thumbnail — the guest-facing upload UI treats poster-capture failure as an upload failure for that item, matching how any other upload-step failure is already surfaced in `GuestUploadView.tsx`'s queue, rather than letting a thumbnail-less row reach the server.
- The poster-only moderation gap (full clip content not inspected) is a disclosed, accepted limitation, not a silent one — carried into this spec's Deferred Scope and into the eventual plan's Global Constraints so no later task quietly assumes deeper coverage exists.
- `upload/complete`'s poster-existence check (above) is the one new failure mode specific to video; on failure it returns the same shape/status the existing "upload completion failed" path already uses, so the guest-facing retry behavior is unchanged.

## Testing

Following this module's established conventions throughout (`tsx --test`, structural/regex assertions where a function has no DB injection seam, real-Supabase round-trip where one exists, the `[eventId]`-bracket-path glob defect worked around by running those files from their own directory):

- `upload-tickets.test.ts`: `objectKeyForVideoPoster` determinism and format; `extensionFor`'s existing video branch (already correct, verify it stays that way).
- `upload-queue.test.ts`: extending `enqueue`/`UploadOneFn`/`PersistedEntry` with an optional `posterFile` doesn't break the existing single-file (photo) path; a failed upload with a poster file present retries both parts together, not just one.
- `upload/init` route test: video accepted for all three content types, rejected over 50MB, rejected on an unsupported type; response includes `posterUploadUrl` only for video.
- `upload/complete` route test: poster-existence check gates the status flip for video; photo path unaffected.
- `repository.test.ts`: no new functions needed here (no schema change), but extend existing structural checks that already assert `moderation`/`processing` scoping to confirm they remain kind-agnostic.
- `moderate/route.ts` test: video branch downloads the poster (not a derivative), reuses the same `DetectModerationLabels`/`DetectLabels` calls, confirmed via the existing dependency-injection seam already used for the photo path's own tests.
- `MediaLightbox.test.ts`/`.tsx` tests: a video item renders `<video controls>` with the display URL, not an `<img>`; swipe navigation between a photo and a video item in the same list still advances the index correctly.
- Grid components: play-badge renders only for `mediaKind === "video"`.
- Manual, browser-verified (not automatable in this test environment, matching this session's own established practice for real gesture/media behavior): actual video capture-and-poster-frame extraction on a real phone camera, and playback of a `.mov` file across at least Safari and Chrome.

## Deferred scope

Explicitly out of scope for this pass, to be revisited only if a real need arises:

- Full video content moderation beyond the poster frame (the copy-to-scratch-S3 and S3-native-storage options discussed and rejected above stay documented here as the two upgrade paths if this is ever revisited).
- In-grid autoplay (Instagram/TikTok-feed style) — considered and rejected for bandwidth/battery reasons on a guest's own device.
- Any server-side transcoding or derivative generation.
- Video participation in "Find Me" (the next, separate feature) — Find Me's own design will decide whether/how video fits in.
- A play-badge or duration indicator specifically in the host review queue (functions correctly without one; purely a nice-to-have).
