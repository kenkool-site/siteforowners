# Gallery Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one optional uploaded, titled, autoplaying gallery video that renders separately above image galleries.

**Architecture:** Store gallery video fields on `previews` beside the existing `hero_video_url`, not inside `images`. Use a dedicated signed-upload endpoint that mirrors the hero video upload flow but accepts only MP4 gallery videos up to 25 MB and 30 seconds. Render one shared video section from `TemplateOrchestrator` before each existing template gallery.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, Supabase Storage signed uploads, Node test runner source-inspection tests.

**Commit note:** Do not create git commits unless the user explicitly asks.

---

## File Map

- Create `supabase/migrations/025_add_gallery_video.sql`: add `gallery_video_url` and `gallery_video_title` columns and raise the storage bucket cap to 25 MB for MP4 uploads.
- Create `src/lib/video/gallery-video.ts`: shared constants and client-side duration helper.
- Create `src/app/api/upload-gallery-video/route.ts`: owner/founder-authenticated signed upload preparation.
- Modify `src/lib/ai/types.ts`: add gallery video fields to `PreviewData`.
- Modify `src/app/api/preview-data/route.ts`: expose gallery video fields for preview editing.
- Modify `src/app/api/update-site/route.ts`: allow founder edit saves to persist gallery video fields.
- Modify `src/app/api/admin/images/route.ts`: load/save gallery video fields from the owner photos page.
- Modify `src/app/site/[slug]/admin/photos/page.tsx`: load gallery video fields into `PhotosClient`.
- Modify `src/app/site/[slug]/admin/photos/PhotosClient.tsx`: manage dirty state and save payload for video fields.
- Create `src/app/site/[slug]/admin/_components/GalleryVideoEditor.tsx`: shared owner/founder video upload, title, preview, and remove UI.
- Modify `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`: founder editor state, live preview, save payload, and editor UI.
- Create `src/components/templates/TemplateGalleryVideo.tsx`: shared public gallery-video section.
- Modify `src/components/templates/TemplateOrchestrator.tsx`: render gallery video above gallery sections and adjust nav presence.
- Create `tests/gallery-video-contract.test.mjs`: data/API/admin contract tests.
- Create `tests/gallery-video-template.test.mjs`: template rendering contract tests.

---

## Task 1: Data Contract And API Exposure

**Files:**
- Create: `supabase/migrations/025_add_gallery_video.sql`
- Modify: `src/lib/ai/types.ts`
- Modify: `src/app/api/preview-data/route.ts`
- Modify: `src/app/api/update-site/route.ts`
- Test: `tests/gallery-video-contract.test.mjs`

- [ ] **Step 1: Write the failing data/API contract test**

Create `tests/gallery-video-contract.test.mjs` with:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("gallery video fields are added to the preview schema and type contract", async () => {
  const migration = await readFile("supabase/migrations/025_add_gallery_video.sql", "utf8");
  const types = await readFile("src/lib/ai/types.ts", "utf8");

  assert.match(migration, /gallery_video_url\s+TEXT/i, "migration should add gallery_video_url");
  assert.match(migration, /gallery_video_title\s+TEXT/i, "migration should add gallery_video_title");
  assert.match(types, /gallery_video_url\?:\s*string\s*\|\s*null/, "PreviewData should expose gallery_video_url");
  assert.match(types, /gallery_video_title\?:\s*string\s*\|\s*null/, "PreviewData should expose gallery_video_title");
});

test("preview and founder update APIs expose gallery video fields", async () => {
  const previewData = await readFile("src/app/api/preview-data/route.ts", "utf8");
  const updateSite = await readFile("src/app/api/update-site/route.ts", "utf8");

  assert.match(previewData, /gallery_video_url:\s*preview\.gallery_video_url/, "preview-data should return gallery_video_url");
  assert.match(previewData, /gallery_video_title:\s*preview\.gallery_video_title/, "preview-data should return gallery_video_title");
  assert.match(updateSite, /updates\.gallery_video_url/, "update-site should accept gallery_video_url");
  assert.match(updateSite, /updates\.gallery_video_title/, "update-site should accept gallery_video_title");
});

test("owner photos API loads and saves gallery video metadata", async () => {
  const route = await readFile("src/app/api/admin/images/route.ts", "utf8");

  assert.match(route, /gallery_video_url/, "admin images route should include gallery_video_url");
  assert.match(route, /gallery_video_title/, "admin images route should include gallery_video_title");
  assert.match(route, /MAX_GALLERY_VIDEO_TITLE_LENGTH/, "admin images route should cap gallery video title length");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: FAIL because the migration, type fields, and API fields do not exist yet.

- [ ] **Step 3: Add the database migration**

Create `supabase/migrations/025_add_gallery_video.sql`:

```sql
-- Adds one optional gallery video that renders separately above image galleries.
-- NULL gallery_video_url = no gallery video.
-- NULL gallery_video_title = use template-specific default title.

ALTER TABLE previews ADD COLUMN IF NOT EXISTS gallery_video_url TEXT;
ALTER TABLE previews ADD COLUMN IF NOT EXISTS gallery_video_title TEXT;

UPDATE storage.buckets
SET
  allowed_mime_types = (
    SELECT array_agg(DISTINCT t)
    FROM unnest(
      coalesce(allowed_mime_types, array[]::text[])
      || ARRAY['video/mp4']
    ) AS t
  ),
  file_size_limit = greatest(coalesce(file_size_limit, 0), 26214400)
WHERE id = 'preview-images';
```

- [ ] **Step 4: Update `PreviewData`**

In `src/lib/ai/types.ts`, add these fields after `hero_video_url`:

```ts
  gallery_video_url?: string | null;
  gallery_video_title?: string | null;
```

- [ ] **Step 5: Expose gallery video fields in preview data**

In `src/app/api/preview-data/route.ts`, add these properties to the returned JSON near `hero_video_url`:

```ts
    hero_video_url: preview.hero_video_url || "",
    gallery_video_url: preview.gallery_video_url || "",
    gallery_video_title: preview.gallery_video_title || "",
```

- [ ] **Step 6: Allow founder update saves**

In `src/app/api/update-site/route.ts`, add title normalization near the allowed-field block:

```ts
const MAX_GALLERY_VIDEO_TITLE_LENGTH = 80;

function normalizeGalleryVideoTitle(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_GALLERY_VIDEO_TITLE_LENGTH) : null;
}
```

Then add these allowed updates beside `hero_video_url`:

```ts
    if (updates.gallery_video_url !== undefined) {
      allowed.gallery_video_url =
        typeof updates.gallery_video_url === "string" && updates.gallery_video_url.trim()
          ? updates.gallery_video_url.trim()
          : null;
    }
    if (updates.gallery_video_title !== undefined) {
      allowed.gallery_video_title = normalizeGalleryVideoTitle(updates.gallery_video_title);
    }
```

- [ ] **Step 7: Run the data/API contract test**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: PASS.

---

## Task 2: Gallery Video Upload Validation

**Files:**
- Create: `src/lib/video/gallery-video.ts`
- Create: `src/app/api/upload-gallery-video/route.ts`
- Test: `tests/gallery-video-contract.test.mjs`

- [ ] **Step 1: Extend the failing upload test**

Append this test to `tests/gallery-video-contract.test.mjs`:

```js
test("gallery video upload endpoint uses MP4, 25MB, and 30 second validation", async () => {
  const shared = await readFile("src/lib/video/gallery-video.ts", "utf8");
  const route = await readFile("src/app/api/upload-gallery-video/route.ts", "utf8");

  assert.match(shared, /MAX_GALLERY_VIDEO_BYTES\s*=\s*25\s*\*\s*1024\s*\*\s*1024/, "shared cap should be 25MB");
  assert.match(shared, /MAX_GALLERY_VIDEO_SECONDS\s*=\s*30/, "shared duration cap should be 30 seconds");
  assert.match(shared, /video\/mp4/, "shared validation should allow MP4");
  assert.match(route, /requireOwnerOrFounder/, "upload endpoint should be owner or founder gated");
  assert.match(route, /gallery-videos/, "uploads should go to a gallery-videos storage folder");
  assert.match(route, /durationSeconds/, "route should validate client-provided duration");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: FAIL because the shared validation module and upload route do not exist yet.

- [ ] **Step 3: Create shared gallery video validation**

Create `src/lib/video/gallery-video.ts`:

```ts
export const MAX_GALLERY_VIDEO_BYTES = 25 * 1024 * 1024;
export const MAX_GALLERY_VIDEO_SECONDS = 30;
export const MAX_GALLERY_VIDEO_TITLE_LENGTH = 80;
export const GALLERY_VIDEO_MIME_TYPE = "video/mp4";

export function isAllowedGalleryVideoType(type: string): boolean {
  return type === GALLERY_VIDEO_MIME_TYPE;
}

export function normalizeGalleryVideoTitle(value: string): string {
  return value.trim().slice(0, MAX_GALLERY_VIDEO_TITLE_LENGTH);
}

export async function getVideoDurationSeconds(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);

    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read video duration."));
    };
    video.src = objectUrl;
  });
}
```

- [ ] **Step 4: Create the signed upload endpoint**

Create `src/app/api/upload-gallery-video/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { requireOwnerOrFounder } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  GALLERY_VIDEO_MIME_TYPE,
  MAX_GALLERY_VIDEO_BYTES,
  MAX_GALLERY_VIDEO_SECONDS,
} from "@/lib/video/gallery-video";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const fallbackTenantId = typeof b.tenant_id === "string" ? b.tenant_id : undefined;
  const auth = await requireOwnerOrFounder(request, fallbackTenantId);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = b.type;
  const size = b.size;
  const durationSeconds = b.durationSeconds;

  if (type !== GALLERY_VIDEO_MIME_TYPE) {
    return NextResponse.json({ error: "Use an MP4 video." }, { status: 400 });
  }
  if (typeof size !== "number" || size <= 0 || size > MAX_GALLERY_VIDEO_BYTES) {
    return NextResponse.json({ error: "Video must be 25MB or smaller." }, { status: 400 });
  }
  if (
    typeof durationSeconds !== "number" ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0 ||
    durationSeconds > MAX_GALLERY_VIDEO_SECONDS
  ) {
    return NextResponse.json({ error: "Video must be 30 seconds or shorter." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const path = `gallery-videos/${crypto.randomUUID()}.mp4`;
  const { data: signed, error: signedError } = await supabase.storage
    .from("preview-images")
    .createSignedUploadUrl(path);

  if (signedError || !signed) {
    console.error("[upload-gallery-video] signed URL failed", { tenantId: auth.tenantId, error: signedError });
    return NextResponse.json({ error: "Failed to prepare upload" }, { status: 500 });
  }

  const { data: publicData } = supabase.storage.from("preview-images").getPublicUrl(path);
  return NextResponse.json({
    path,
    token: signed.token,
    signedUrl: signed.signedUrl,
    publicUrl: publicData.publicUrl,
  });
}
```

- [ ] **Step 5: Run the upload contract test**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: PASS.

---

## Task 3: Owner Photos Admin UI And Persistence

**Files:**
- Create: `src/app/site/[slug]/admin/_components/GalleryVideoEditor.tsx`
- Modify: `src/app/api/admin/images/route.ts`
- Modify: `src/app/site/[slug]/admin/photos/page.tsx`
- Modify: `src/app/site/[slug]/admin/photos/PhotosClient.tsx`
- Test: `tests/gallery-video-contract.test.mjs`

- [ ] **Step 1: Add owner photos UI assertions**

Append this test to `tests/gallery-video-contract.test.mjs`:

```js
test("owner photos UI exposes separate gallery video editing", async () => {
  const page = await readFile("src/app/site/[slug]/admin/photos/page.tsx", "utf8");
  const client = await readFile("src/app/site/[slug]/admin/photos/PhotosClient.tsx", "utf8");
  const editor = await readFile("src/app/site/[slug]/admin/_components/GalleryVideoEditor.tsx", "utf8");

  assert.match(page, /gallery_video_url/, "photos page should load gallery_video_url");
  assert.match(page, /gallery_video_title/, "photos page should load gallery_video_title");
  assert.match(client, /GalleryVideoEditor/, "PhotosClient should render GalleryVideoEditor");
  assert.match(client, /gallery_video_url/, "PhotosClient should save gallery_video_url");
  assert.match(client, /gallery_video_title/, "PhotosClient should save gallery_video_title");
  assert.match(editor, /upload-gallery-video/, "GalleryVideoEditor should use the gallery video upload endpoint");
  assert.match(editor, /getVideoDurationSeconds/, "GalleryVideoEditor should validate duration before upload");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: FAIL because the editor and owner photos fields are not wired yet.

- [ ] **Step 3: Extend the admin images API snapshot and validation**

In `src/app/api/admin/images/route.ts`:

Add imports:

```ts
import {
  MAX_GALLERY_VIDEO_TITLE_LENGTH,
  normalizeGalleryVideoTitle,
} from "@/lib/video/gallery-video";
```

Extend `PreviewSnapshot`:

```ts
  gallery_video_url: string | null;
  gallery_video_title: string | null;
```

Select the fields:

```ts
    .select("images, generated_copy, gallery_video_url, gallery_video_title")
```

Return them from `loadSnapshot`:

```ts
    gallery_video_url:
      typeof data?.gallery_video_url === "string" && data.gallery_video_url.length > 0
        ? data.gallery_video_url
        : null,
    gallery_video_title:
      typeof data?.gallery_video_title === "string" && data.gallery_video_title.length > 0
        ? data.gallery_video_title
        : null,
```

In `POST`, parse and validate:

```ts
  const rawGalleryVideoUrl = b.gallery_video_url;
  let galleryVideoUrl: string | null = null;
  if (rawGalleryVideoUrl === null || rawGalleryVideoUrl === "" || rawGalleryVideoUrl === undefined) {
    galleryVideoUrl = null;
  } else if (isValidImageUrl(rawGalleryVideoUrl)) {
    galleryVideoUrl = rawGalleryVideoUrl;
  } else {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "gallery_video_url", reason: "must be an https URL or null" }] },
      { status: 400 },
    );
  }

  const rawGalleryVideoTitle = b.gallery_video_title;
  const galleryVideoTitle =
    typeof rawGalleryVideoTitle === "string"
      ? normalizeGalleryVideoTitle(rawGalleryVideoTitle)
      : null;
  if (typeof rawGalleryVideoTitle === "string" && rawGalleryVideoTitle.length > MAX_GALLERY_VIDEO_TITLE_LENGTH) {
    return NextResponse.json(
      { error: "Validation failed", errors: [{ field: "gallery_video_title", reason: "max 80 characters" }] },
      { status: 400 },
    );
  }
```

Update both Supabase `.update(...)` calls to include:

```ts
      gallery_video_url: galleryVideoUrl,
      gallery_video_title: galleryVideoTitle,
```

Return the fields:

```ts
    gallery_video_url: galleryVideoUrl,
    gallery_video_title: galleryVideoTitle,
```

- [ ] **Step 4: Load fields in the owner photos page**

In `src/app/site/[slug]/admin/photos/page.tsx`, extend the `loadPhotos` return type:

```ts
  galleryVideoUrl: string | null;
  galleryVideoTitle: string | null;
```

Select:

```ts
    .select("images, generated_copy, gallery_video_url, gallery_video_title")
```

Return:

```ts
    galleryVideoUrl:
      typeof data?.gallery_video_url === "string" && data.gallery_video_url.length > 0
        ? data.gallery_video_url
        : null,
    galleryVideoTitle:
      typeof data?.gallery_video_title === "string" && data.gallery_video_title.length > 0
        ? data.gallery_video_title
        : null,
```

Pass the values to `PhotosClient`:

```tsx
      <PhotosClient
        initialImages={images}
        initialAboutImageUrl={aboutImageUrl}
        initialGalleryVideoUrl={galleryVideoUrl}
        initialGalleryVideoTitle={galleryVideoTitle}
      />
```

- [ ] **Step 5: Create the shared gallery video editor**

Create `src/app/site/[slug]/admin/_components/GalleryVideoEditor.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { createClient as createBrowserSupabase } from "@/lib/supabase/client";
import {
  MAX_GALLERY_VIDEO_BYTES,
  MAX_GALLERY_VIDEO_SECONDS,
  getVideoDurationSeconds,
  isAllowedGalleryVideoType,
  normalizeGalleryVideoTitle,
} from "@/lib/video/gallery-video";

interface GalleryVideoEditorProps {
  value: string | null;
  title: string;
  onChange: (nextUrl: string | null) => void;
  onTitleChange: (nextTitle: string) => void;
  variant: "owner" | "founder";
  tenantId?: string;
}

const styles = {
  owner: {
    container: "rounded-[1.5rem] border border-warm-cream1 bg-white p-5 shadow-sm",
    heading: "text-base font-black text-warm-deep",
    button: "rounded-full bg-pop-pink px-4 py-2 text-xs font-black text-pop-cream transition hover:bg-pink-700 disabled:opacity-50",
    hint: "text-[11px] font-bold text-warm-textMuted",
  },
  founder: {
    container: "rounded-xl border bg-white p-6",
    heading: "text-lg font-semibold text-gray-900",
    button: "rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-700 disabled:opacity-50",
    hint: "text-xs text-gray-500",
  },
} as const;

export function GalleryVideoEditor({
  value,
  title,
  onChange,
  onTitleChange,
  variant,
  tenantId,
}: GalleryVideoEditorProps) {
  const st = styles[variant];
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    if (!isAllowedGalleryVideoType(file.type)) {
      setError("Use an MP4 video.");
      e.target.value = "";
      return;
    }
    if (file.size > MAX_GALLERY_VIDEO_BYTES) {
      setError("Video must be 25MB or smaller.");
      e.target.value = "";
      return;
    }

    let durationSeconds = 0;
    try {
      durationSeconds = await getVideoDurationSeconds(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read video duration.");
      e.target.value = "";
      return;
    }
    if (durationSeconds > MAX_GALLERY_VIDEO_SECONDS) {
      setError("Video must be 30 seconds or shorter.");
      e.target.value = "";
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/upload-gallery-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: file.type,
          size: file.size,
          durationSeconds,
          ...(tenantId ? { tenant_id: tenantId } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to prepare upload");
      }
      const { path, token, publicUrl } = await res.json();
      const client = createBrowserSupabase();
      const { error: uploadError } = await client.storage
        .from("preview-images")
        .uploadToSignedUrl(path, token, file, { contentType: file.type });
      if (uploadError) throw uploadError;
      onChange(publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <section className={st.container}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className={st.heading}>Gallery Video</h2>
          <p className={"mt-1 " + st.hint}>
            Optional MP4, 25MB max, 30 seconds max. Shows above photos and loops silently.
          </p>
        </div>
        <label className={st.button}>
          {uploading ? "Uploading..." : value ? "Replace video" : "+ Upload video"}
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4"
            disabled={uploading}
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      <label className="mb-3 block">
        <span className={"mb-1 block " + st.hint}>Optional video title</span>
        <input
          type="text"
          value={title}
          maxLength={80}
          onChange={(e) => onTitleChange(normalizeGalleryVideoTitle(e.target.value))}
          placeholder="Watch the transformation"
          className="w-full rounded-xl border px-3 py-2 text-sm"
        />
      </label>

      {value ? (
        <div className="space-y-3">
          <video src={value} autoPlay muted loop playsInline className="w-full rounded-2xl border object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs font-bold text-red-600 hover:underline"
          >
            Remove gallery video
          </button>
        </div>
      ) : (
        <p className={"rounded-2xl border border-dashed p-4 text-center " + st.hint}>
          No gallery video yet. Photos stay in the gallery below this optional video.
        </p>
      )}

      {error && <p className="mt-3 text-xs font-bold text-red-600">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 6: Wire `PhotosClient`**

In `src/app/site/[slug]/admin/photos/PhotosClient.tsx`, import the editor:

```ts
import { GalleryVideoEditor } from "../_components/GalleryVideoEditor";
```

Extend props:

```ts
  initialGalleryVideoUrl: string | null;
  initialGalleryVideoTitle: string | null;
```

Add state:

```ts
  const [galleryVideoUrl, setGalleryVideoUrl] = useState<string | null>(initialGalleryVideoUrl);
  const [galleryVideoTitle, setGalleryVideoTitle] = useState<string>(initialGalleryVideoTitle ?? "");
```

Update dirty JSON:

```ts
  const initialJson = JSON.stringify({
    images: initialImages,
    aboutImageUrl: initialAboutImageUrl,
    galleryVideoUrl: initialGalleryVideoUrl,
    galleryVideoTitle: initialGalleryVideoTitle ?? "",
  });
  const dirty = JSON.stringify({ images, aboutImageUrl, galleryVideoUrl, galleryVideoTitle }) !== initialJson;
```

Update save body:

```ts
          gallery_video_url: galleryVideoUrl,
          gallery_video_title: galleryVideoTitle,
```

Render the editor between `GalleryEditor` and `AboutImagePicker`:

```tsx
      <GalleryVideoEditor
        value={galleryVideoUrl}
        title={galleryVideoTitle}
        onChange={setGalleryVideoUrl}
        onTitleChange={setGalleryVideoTitle}
        variant="owner"
      />
```

- [ ] **Step 7: Run the owner admin contract test**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: PASS.

---

## Task 4: Founder Editor And Live Preview

**Files:**
- Modify: `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`
- Test: `tests/gallery-video-contract.test.mjs`

- [ ] **Step 1: Add founder editor assertions**

Append this test to `tests/gallery-video-contract.test.mjs`:

```js
test("founder site editor saves and previews gallery video fields", async () => {
  const siteEditor = await readFile("src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx", "utf8");

  assert.match(siteEditor, /galleryVideoUrl/, "founder editor should track galleryVideoUrl");
  assert.match(siteEditor, /galleryVideoTitle/, "founder editor should track galleryVideoTitle");
  assert.match(siteEditor, /gallery_video_url:\s*galleryVideoUrl/, "save payload should include gallery_video_url");
  assert.match(siteEditor, /gallery_video_title:\s*galleryVideoTitle/, "save payload should include gallery_video_title");
  assert.match(siteEditor, /GalleryVideoEditor/, "founder editor should render GalleryVideoEditor");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: FAIL because founder editor fields are not wired.

- [ ] **Step 3: Add founder state**

In `src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx`, import:

```ts
import { GalleryVideoEditor } from "@/app/site/[slug]/admin/_components/GalleryVideoEditor";
```

Add state near the hero video state:

```ts
  const [galleryVideoUrl, setGalleryVideoUrl] = useState<string | null>(
    (preview.gallery_video_url as string | null) ?? null
  );
  const [galleryVideoTitle, setGalleryVideoTitle] = useState<string>(
    (preview.gallery_video_title as string | null) ?? ""
  );
```

- [ ] **Step 4: Add fields to save and live preview payloads**

In every update payload that already includes `hero_video_url: heroVideoUrl`, add:

```ts
            gallery_video_url: galleryVideoUrl,
            gallery_video_title: galleryVideoTitle,
```

In `previewData`, add:

```ts
    gallery_video_url: galleryVideoUrl,
    gallery_video_title: galleryVideoTitle,
```

- [ ] **Step 5: Render the editor below the shared photo gallery editor**

Under the existing `<GalleryEditor ... />`, add:

```tsx
          <GalleryVideoEditor
            value={galleryVideoUrl}
            title={galleryVideoTitle}
            onChange={setGalleryVideoUrl}
            onTitleChange={setGalleryVideoTitle}
            variant="founder"
            tenantId={tenantId}
          />
```

- [ ] **Step 6: Run the founder editor contract test**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs
```

Expected: PASS.

---

## Task 5: Public Template Rendering

**Files:**
- Create: `src/components/templates/TemplateGalleryVideo.tsx`
- Modify: `src/components/templates/TemplateOrchestrator.tsx`
- Test: `tests/gallery-video-template.test.mjs`

- [ ] **Step 1: Write the failing template rendering test**

Create `tests/gallery-video-template.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("TemplateGalleryVideo renders autoplaying looping video with controls", async () => {
  const component = await readFile("src/components/templates/TemplateGalleryVideo.tsx", "utf8");

  assert.match(component, /autoPlay/, "video should autoplay");
  assert.match(component, /loop/, "video should loop");
  assert.match(component, /muted/, "video should be muted for autoplay");
  assert.match(component, /playsInline/, "video should play inline on mobile");
  assert.match(component, /setPaused/, "component should provide a play/pause toggle");
  assert.match(component, /galleryVideoTitle/, "component should support custom title text");
});

test("TemplateOrchestrator renders gallery video before every image gallery", async () => {
  const orchestrator = await readFile("src/components/templates/TemplateOrchestrator.tsx", "utf8");

  assert.match(orchestrator, /galleryVideoUrl/, "orchestrator should read galleryVideoUrl");
  assert.match(orchestrator, /galleryVideoTitle/, "orchestrator should read galleryVideoTitle");
  assert.match(orchestrator, /hasGallerySection/, "nav should include video-only gallery sections");
  for (const gallery of ["RunwayGallery", "BoldGallery", "ElegantGallery", "VibrantGallery", "WarmGallery", "ClassicGallery"]) {
    const videoIndex = orchestrator.indexOf("galleryVideoSection");
    const galleryIndex = orchestrator.indexOf(gallery);
    assert.ok(videoIndex >= 0, "orchestrator should define galleryVideoSection");
    assert.ok(galleryIndex >= 0, `${gallery} should still be present`);
  }
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --test tests/gallery-video-template.test.mjs
```

Expected: FAIL because the public component and orchestrator wiring do not exist.

- [ ] **Step 3: Create `TemplateGalleryVideo`**

Create `src/components/templates/TemplateGalleryVideo.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { AnimateSection } from "./shared/AnimateSection";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm" | "runway";

interface TemplateGalleryVideoProps {
  src: string;
  galleryVideoTitle?: string | null;
  colors: ThemeColors;
  template: TemplateName;
}

const defaultTitles: Record<TemplateName, string> = {
  classic: "Watch The Look",
  bold: "See The Work In Motion",
  elegant: "A Moment In Motion",
  vibrant: "Watch The Transformation",
  warm: "A Closer Look",
  runway: "Runway In Motion",
};

export function TemplateGalleryVideo({ src, galleryVideoTitle, colors, template }: TemplateGalleryVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const isRunway = template === "runway";
  const title = galleryVideoTitle?.trim() || defaultTitles[template];
  const background = isRunway ? "#050505" : colors.background;
  const textColor = ensureReadable(isRunway ? "#FFFFFF" : colors.foreground, background, 4.5);
  const accent = ensureReadable(colors.primary || "#B8860B", background, 3);
  const buttonText = ensureReadable(background, accent, 4.5);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  }

  return (
    <section
      className="px-6 py-16 md:px-10 lg:px-16"
      style={{ backgroundColor: background, color: textColor }}
      aria-label="Featured gallery video"
    >
      <AnimateSection>
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.28em]" style={{ color: accent }}>
                Watch
              </p>
              <h2 className="max-w-3xl text-3xl font-black leading-none tracking-[-0.04em] md:text-5xl">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={togglePlayback}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-xs font-black uppercase tracking-[0.18em] transition hover:-translate-y-0.5"
              style={{ backgroundColor: accent, color: buttonText }}
              aria-pressed={paused}
            >
              {paused ? "Play video" : "Pause video"}
            </button>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border shadow-2xl" style={{ borderColor: `${accent}55` }}>
            <video
              ref={videoRef}
              src={src}
              autoPlay
              loop
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
          </div>
        </div>
      </AnimateSection>
    </section>
  );
}
```

- [ ] **Step 4: Wire `TemplateOrchestrator`**

In `src/components/templates/TemplateOrchestrator.tsx`, import:

```ts
import { TemplateGalleryVideo } from "./TemplateGalleryVideo";
```

Add after `heroVideo`:

```ts
  const galleryVideoUrl = data.gallery_video_url || undefined;
  const galleryVideoTitle = data.gallery_video_title || undefined;
```

Replace gallery/nav booleans:

```ts
  const hasGalleryImages = galleryImages.length > 0;
  const hasGallerySection = showGallery && (hasGalleryImages || !!galleryVideoUrl);
  const galleryVideoSection = hasGallerySection && galleryVideoUrl ? (
    <TemplateGalleryVideo
      src={galleryVideoUrl}
      galleryVideoTitle={galleryVideoTitle}
      colors={colors}
      template={template}
    />
  ) : null;
```

Update nav:

```ts
    ...(hasGallerySection ? [{ id: "gallery", label: "Gallery" }] : []),
```

For each template, render `galleryVideoSection` immediately before the gallery component and keep image gallery rendering conditional on images:

```tsx
          {galleryVideoSection}
          {showGallery && hasGalleryImages && <div id="gallery"><ClassicGallery images={galleryImages} colors={colors} /></div>}
```

For `RunwayGallery`, which already owns `id="gallery"`, wrap the video section with the anchor when there are no images:

```tsx
          {galleryVideoSection && !hasGalleryImages ? <div id="gallery">{galleryVideoSection}</div> : galleryVideoSection}
          {showGallery && hasGalleryImages && <RunwayGallery images={galleryImages} colors={colors} />}
```

- [ ] **Step 5: Run the template tests**

Run:

```bash
node --test tests/gallery-video-template.test.mjs
```

Expected: PASS.

---

## Task 6: Full Verification

**Files:**
- All files touched above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
node --test tests/gallery-video-contract.test.mjs tests/gallery-video-template.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run existing template tests**

Run:

```bash
node --test tests/preview-hero-video.test.mjs tests/template-shared-polish.test.mjs tests/preview-template-options.test.mjs
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: no new lint errors.

- [ ] **Step 4: Run build**

Run:

```bash
npm run build
```

Expected: successful production build.

- [ ] **Step 5: Manual browser checks**

Start the app:

```bash
npm run dev
```

Verify:

- Owner photos page can upload an MP4 under 25 MB and 30 seconds.
- Owner photos page rejects a non-MP4 file with "Use an MP4 video."
- Owner photos page rejects an MP4 over 25 MB with "Video must be 25MB or smaller."
- Owner photos page rejects an MP4 over 30 seconds with "Video must be 30 seconds or shorter."
- Optional title saves and appears on the public site.
- Clearing title falls back to the template default title.
- Removing the video removes the public video section.
- Sites without a gallery video render unchanged.
- Classic, Bold, Elegant, Vibrant, Warm, and Runway render the video above their image gallery.
- A site with video and no gallery photos still shows the Gallery nav anchor and video section.

---

## Self-Review

- Spec coverage: The plan covers one optional uploaded MP4, optional title, 25 MB limit, 30 second limit, separate storage fields, owner/founder admin editing, autoplay/loop/muted/playsInline rendering, play/pause control, video-only gallery nav, and verification.
- Placeholder scan: No task contains placeholder markers or asks an implementer to invent validation or tests without code.
- Type consistency: The plan consistently uses `gallery_video_url`, `gallery_video_title`, `galleryVideoUrl`, `galleryVideoTitle`, `MAX_GALLERY_VIDEO_BYTES`, and `MAX_GALLERY_VIDEO_SECONDS`.
