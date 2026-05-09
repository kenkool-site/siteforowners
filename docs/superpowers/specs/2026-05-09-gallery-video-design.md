# Gallery Video — Design Spec

**Date:** 2026-05-09
**Status:** Approved design direction
**Goal:** Add one optional uploaded video to the public gallery experience without mixing it into the existing image gallery tiles.

---

## 1. Product Behavior

Each site may have one optional gallery video. Owners upload it from the photos/admin surface, separately from photo uploads. When no video is set, templates render exactly as they do today.

When present, the video appears as a standalone featured video section directly above the existing image gallery. Owners may optionally add a short title for the video section; if they leave it blank, the templates use a polished default title. The image gallery remains image-only and keeps its current template-specific layouts.

The public video should:

- Autoplay.
- Loop.
- Play inline on mobile.
- Be muted by default so browser autoplay works reliably.
- Include a visible play/pause toggle so visitors can stop the looping motion.

## 2. Data Model

Add an optional top-level preview field:

```typescript
gallery_video_url?: string | null;
gallery_video_title?: string | null;
```

This mirrors the existing `hero_video_url` pattern and keeps the video distinct from `images`. The video URL should be persisted independently from gallery photos and cleared by setting the field to `null`. The optional title is plain text, trimmed, and capped at 80 characters.

## 3. Admin Editing

Extend the shared photos/admin experience with a “Gallery Video” card near the photo gallery editor.

The card supports:

- Uploading one `.mp4` video for now.
- Adding, editing, or clearing an optional video title.
- Previewing the current uploaded video.
- Removing the video.
- Saving the video URL and optional title along with the photo settings.

The UI copy should make the separation clear: photos populate the gallery; the video appears above the gallery and does not become a gallery tile.

## 4. Upload Handling

Implement a dedicated video upload path or extend the existing upload flow behind explicit video validation. Keep image and video validation separate so image upload rules stay unchanged.

Initial validation:

- Accept `.mp4`.
- Require HTTPS public URL after upload.
- Enforce a 25 MB maximum file size for the first version.
- Enforce a 30 second maximum duration for autoplay loop quality and page performance.
- Return one URL, not an array of gallery media items.

## 5. Template Rendering

`TemplateOrchestrator` reads `data.gallery_video_url` and passes it to a new shared video section component. The section renders only when `show_gallery` is enabled and a gallery video URL exists. If a site has a gallery video but no gallery photos, the video section still renders as the gallery area.

Placement:

- `Runway`: video section before `RunwayGallery`.
- `Bold`: video section before `BoldGallery`.
- `Elegant`: video section before `ElegantGallery`.
- `Vibrant`: video section before `VibrantGallery`.
- `Warm`: video section before `WarmGallery`.
- `Classic`: video section before `ClassicGallery`.

The nav “Gallery” item should appear when either gallery images or a gallery video exists, because the section remains part of the gallery area.

## 6. Visual Direction

Use a “Featured Video Above Gallery” treatment:

- A clear label such as “Watch The Look” or a template-specific equivalent.
- The owner-provided video title when present; otherwise a template-specific default title.
- A large `16:9` or responsive cinematic player.
- Rounded, polished framing that matches the active template’s colors.
- A subtle overlay or badge indicating it is video/motion content.
- Existing gallery images remain below as their own section.

Template styling should feel native:

- `Runway`: dark editorial frame, gold border, high-contrast label.
- `Bold`: strong full-width block with punchy color contrast.
- `Elegant`: restrained, airy frame with soft spacing.
- `Vibrant`: saturated, energetic shell with playful accent treatment.
- `Warm`: cozy rounded frame and softer copy.
- `Classic`: clean professional block with simple heading and CTA-compatible spacing.

## 7. Accessibility And Performance

Because autoplay video loops by default, provide a visible pause/play toggle and accessible labeling for the video section.

Use a responsive video element with:

```tsx
<video autoPlay loop muted playsInline />
```

Avoid loading this section when no video URL exists. Do not create a poster requirement for the first version; the browser will show the video frame once loaded.

## 8. Verification

Test the change by:

- Uploading and saving a gallery video from owner/admin photos.
- Removing the gallery video.
- Confirming sites without a video render unchanged.
- Confirming every template places the video above the image gallery.
- Confirming uploads over 25 MB or longer than 30 seconds are rejected with clear messaging.
- Confirming video autoplay/loop behavior on desktop and mobile-sized viewports.
- Running lint and build checks.
