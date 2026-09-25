# InviteSpot Memories — "Every Perspective" Design

**Status:** Approved for planning (brainstorming complete 2026-09-25)

## Summary

When a guest is viewing a photo or video full-screen in the shared `MediaLightbox`, show them the other photos/videos captured around the same instant — "3 others captured this moment" — so guests can see everyone's angle on a moment, not just the one they tapped into. This was the highest-priority recommendation from external product feedback (`InviteSpot_Memories_Product_Feedback.docx`), chosen over "Find Me" because it needs no new AI/face-recognition infrastructure: it's buildable entirely from data already collected.

## Background

Every `memory_media` row already has `captured_at` (backfilled by migration 060: EXIF when present, else upload time — never null). Guest-facing views already expose `capturedAt` and `uploaderDisplayName` on every item via `PublicMemoryMedia` (`src/lib/invitations/memories/gallery.ts`). No schema change is required.

## Matching rule

"Same moment" is defined as a **pure capture-time window**: any other gallery-visible photo/video in the same event whose `captured_at` falls within **±3 minutes** of the viewed item's `captured_at`. This does not depend on the host having configured Moments, or on AI Highlights having run — it always works, for every event, from day one.

Moment membership and Highlight-group membership were both considered and rejected as the primary signal: Moments are optional (many hosts won't create any), and Highlight categories can span an entire reception ("Dancing"), which isn't "the same instant." Time-window is the only signal guaranteed to exist and to mean what it claims.

Matching excludes the viewed item itself. It does **not** exclude the viewing guest's own other uploads from that moment — the matching query has no notion of "whose session is this," and adding one for a minor cosmetic edge case (occasionally seeing your own other shot in your own strip) isn't worth the complexity for v1.

## API

`GET /api/memories/media/[mediaId]/nearby`

Mirrors the existing `[mediaId]/[variant]/route.ts` in access model: no session/auth check beyond the same `computeGalleryVisible` gate everything else in this module uses. Looks up the media row; 404s if it isn't gallery-visible; otherwise queries `memory_media` for the same `event_id`, gallery-visible, `captured_at` within the ±3-minute window, ordered by closeness, excluding the anchor row. Returns the `PublicMemoryMedia` shape (`id`, `mediaKind`, `uploaderDisplayName`, `capturedAt`) for each match — not just ids, since the lightbox needs enough to render thumbnails and captions without a second round trip, and needs the full cluster (including the anchor item) to support the detour flow below.

Per this repo's `route.ts` constraint (a route file may only export HTTP handlers), the query itself lives in a sibling file the route calls, matching the established pattern (`moderate-media.ts`, `guest-highlights.ts`, etc.).

## UI: the strip

Placement (validated via mockup): an overlay strip on top of the photo/video itself, anchored above the existing "Photo X of Y" viewer-count label, using the same dark gradient scrim. Not a below-the-photo sheet — it adds zero height to the lightbox and the existing viewer-count label already lives in that same footer zone.

- Label: "N others captured this moment" (ICU plural, singular "1 other captured this moment").
- Horizontally scrollable row of ~52px rounded thumbnails (`/api/memories/media/[id]/thumbnail`, works for both photo and video).
- A thumbnail whose `uploaderDisplayName` is set shows a small caption underneath; unlabeled uploads (the common case today) show no caption, matching existing behavior elsewhere in the app.
- A video match gets the same play-badge overlay already used on video tiles in Gallery/Moments/Highlights.
- The strip is omitted entirely when there are zero matches, or before the fetch resolves — no loading spinner, no empty state copy. It's a quiet enhancement, not a load-bearing element.
- The strip fetches fresh data whenever the lightbox's displayed item changes, cached per `mediaId` within the component instance so navigating back and forth doesn't refetch.
- The strip hides during the lightbox's existing slide transition (`isDragging || suppressTransition`) and reappears once settled, showing the new item's own matches — otherwise it would show stale captions for the outgoing photo mid-animation.

## Interaction: tapping a thumbnail

The common case: the tapped match is already present in the lightbox's current `media` list (true for Gallery and Moments, which always load the entire event's gallery-visible set). Tapping it just calls the existing `onNavigate(index)` — no new mechanism needed.

The edge case: inside an AI Highlights category, `media` is scoped to that category's members only, so a time-adjacent match may not be in the list at all. In that case the lightbox enters a **detour**: it displays the tapped item directly (independent of the original `media`/`index` props), and prev/next plus swipe now page through the matched cluster the strip already fetched (which includes the item the guest detoured from, so it's browsable in both directions) rather than the original category list. The footer label switches from the category-scoped format ("Cake · 1 of 4") to a generic one ("Browsing nearby moment · 1 of 3") so it's unambiguous that the guest has left the category. The close (✕) control always exits the entire lightbox from either mode — there's no "back to category" step; that matches how deep a guest can already wander via ordinary swipe/prev-next.

## Non-goals (v1)

- No Moment- or Highlight-group-based matching — pure time-window only, per above.
- No exclusion of the viewer's own uploads.
- No Moments-tab integration — Moments has no lightbox wired in today at all (a pre-existing gap, not introduced here), so it's out of scope.
- No configurability of the 3-minute window; it's a fixed constant.
- No new AWS/AI infrastructure of any kind.

## Testing

- `findNearbyMatches(target, candidates, windowMs)`: pure, unit-tested with fixed timestamps — no DB needed to verify the window logic.
- The route's query logic (sibling file): tested via this codebase's established real-Supabase round-trip convention (`.env.local` credentials), same as other repository-layer tests this session.
- `resolveNearbyTap(currentMedia, currentIndex, tappedId, nearbyCluster)`: pure decision function returning `{ mode: "list", index }` or `{ mode: "detour", media, index }` — unit-tested directly, following the same precedent as `resolveSwipeNavigation` (jsdom can't usefully simulate real pointer/touch gestures, so decision logic is extracted and tested in isolation instead).
- `MediaLightbox.test.tsx`: new cases for strip-renders-with-matches, strip-hidden-with-none, strip-hidden-during-drag/settle, tap-in-list navigates via `onNavigate`, tap-outside-list enters detour mode and updates the footer label.

## i18n

New keys under `invitations.public.memories.lightbox`, English + Spanish:
- `nearbyCount`: `"{count, plural, one {# other captured this moment} other {# others captured this moment}}"`
- `nearbyDetourLabel`: `"Browsing nearby moment · {current} of {total}"`
