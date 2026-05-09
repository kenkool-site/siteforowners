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
  assert.match(updateSite, /updateFields\.gallery_video_url/, "update-site should accept gallery_video_url");
  assert.match(updateSite, /updateFields\.gallery_video_title/, "update-site should accept gallery_video_title");
  assert.match(updateSite, /request\.cookies\.get\("admin_session"\)/, "update-site should require founder admin session");
  assert.match(updateSite, /isGalleryVideoUrl/, "update-site should only save uploaded gallery video URLs");
});

test("owner photos API loads and saves gallery video metadata", async () => {
  const route = await readFile("src/app/api/admin/images/route.ts", "utf8");

  assert.match(route, /gallery_video_url/, "admin images route should include gallery_video_url");
  assert.match(route, /gallery_video_title/, "admin images route should include gallery_video_title");
  assert.match(route, /MAX_GALLERY_VIDEO_TITLE_LENGTH/, "admin images route should cap gallery video title length");
  assert.match(route, /isGalleryVideoUrl/, "admin images route should only save uploaded gallery video URLs");
  assert.match(
    route,
    /body\s*!==\s*null\s*&&\s*typeof\s+body\s*===\s*"object"\s*&&\s*!Array\.isArray\(body\)/,
    "admin images route should reject non-object JSON bodies before reading fields",
  );
});

test("gallery video upload endpoint uses MP4, 25MB, and 30 second validation", async () => {
  const shared = await readFile("src/lib/video/gallery-video.ts", "utf8");
  const route = await readFile("src/app/api/upload-gallery-video/route.ts", "utf8");

  assert.match(shared, /MAX_GALLERY_VIDEO_BYTES\s*=\s*25\s*\*\s*1024\s*\*\s*1024/, "shared cap should be 25MB");
  assert.match(shared, /MAX_GALLERY_VIDEO_SECONDS\s*=\s*30/, "shared duration cap should be 30 seconds");
  assert.match(shared, /video\/mp4/, "shared validation should allow MP4");
  assert.match(shared, /NEXT_PUBLIC_SUPABASE_URL/, "shared URL validation should require configured Supabase origin");
  assert.match(shared, /storage\/v1\/object\/public\/preview-images\/gallery-videos/, "shared URL validation should require the gallery-videos upload path");
  assert.match(route, /requireOwnerOrFounder/, "upload endpoint should be owner or founder gated");
  assert.match(route, /gallery-videos/, "uploads should go to a gallery-videos storage folder");
  assert.match(route, /durationSeconds/, "route should validate client-provided duration");
  assert.match(
    route,
    /body\s*!==\s*null\s*&&\s*typeof\s+body\s*===\s*"object"\s*&&\s*!Array\.isArray\(body\)/,
    "route should reject non-object JSON bodies before reading fields",
  );
});

test("owner photos UI exposes separate gallery video editing", async () => {
  const page = await readFile("src/app/site/[slug]/admin/photos/page.tsx", "utf8");
  const client = await readFile("src/app/site/[slug]/admin/photos/PhotosClient.tsx", "utf8");
  const editor = await readFile("src/app/site/[slug]/admin/_components/GalleryVideoEditor.tsx", "utf8");

  assert.match(page, /gallery_video_url/, "photos page should load gallery_video_url");
  assert.match(page, /gallery_video_title/, "photos page should load gallery_video_title");
  assert.match(client, /GalleryVideoEditor/, "PhotosClient should render GalleryVideoEditor");
  assert.match(client, /gallery_video_url/, "PhotosClient should save gallery_video_url");
  assert.match(client, /gallery_video_title/, "PhotosClient should save gallery_video_title");
  assert.match(client, /persistedSnapshot/, "PhotosClient should compare dirty state against the last persisted snapshot");
  assert.match(client, /setPersistedSnapshot/, "PhotosClient should reset dirty state after successful save");
  assert.match(editor, /upload-gallery-video/, "GalleryVideoEditor should use the gallery video upload endpoint");
  assert.match(editor, /getVideoDurationSeconds/, "GalleryVideoEditor should validate duration before upload");
});

test("founder site editor saves and previews gallery video fields", async () => {
  const siteEditor = await readFile("src/app/(admin)/clients/[tenantId]/edit/SiteEditor.tsx", "utf8");

  assert.match(siteEditor, /galleryVideoUrl/, "founder editor should track galleryVideoUrl");
  assert.match(siteEditor, /galleryVideoTitle/, "founder editor should track galleryVideoTitle");
  assert.match(siteEditor, /gallery_video_url:\s*galleryVideoUrl/, "save payload should include gallery_video_url");
  assert.match(siteEditor, /gallery_video_title:\s*galleryVideoTitle/, "save payload should include gallery_video_title");
  assert.match(siteEditor, /GalleryVideoEditor/, "founder editor should render GalleryVideoEditor");
});
