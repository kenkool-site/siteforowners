"use client";

import { useState } from "react";
import { GalleryEditor } from "../_components/GalleryEditor";
import { GalleryVideoEditor } from "../_components/GalleryVideoEditor";
import { AboutImagePicker } from "../_components/AboutImagePicker";

interface PhotosClientProps {
  initialImages: string[];
  initialAboutImageUrl: string | null;
  initialGalleryVideoUrl: string | null;
  initialGalleryVideoTitle: string | null;
}

interface PhotosSnapshot {
  images: string[];
  aboutImageUrl: string | null;
  galleryVideoUrl: string | null;
  galleryVideoTitle: string;
}

export function PhotosClient({
  initialImages,
  initialAboutImageUrl,
  initialGalleryVideoUrl,
  initialGalleryVideoTitle,
}: PhotosClientProps) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [aboutImageUrl, setAboutImageUrl] = useState<string | null>(initialAboutImageUrl);
  const [galleryVideoUrl, setGalleryVideoUrl] = useState<string | null>(initialGalleryVideoUrl);
  const [galleryVideoTitle, setGalleryVideoTitle] = useState(initialGalleryVideoTitle ?? "");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialSnapshot: PhotosSnapshot = {
    images: initialImages,
    aboutImageUrl: initialAboutImageUrl,
    galleryVideoUrl: initialGalleryVideoUrl,
    galleryVideoTitle: initialGalleryVideoTitle ?? "",
  };
  const [persistedSnapshot, setPersistedSnapshot] = useState<PhotosSnapshot>(initialSnapshot);
  const currentSnapshot: PhotosSnapshot = { images, aboutImageUrl, galleryVideoUrl, galleryVideoTitle };
  const dirty = JSON.stringify(currentSnapshot) !== JSON.stringify(persistedSnapshot);

  async function save() {
    const snapshotToSave = currentSnapshot;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: snapshotToSave.images,
          about_image_url: snapshotToSave.aboutImageUrl,
          gallery_video_url: snapshotToSave.galleryVideoUrl,
          gallery_video_title: snapshotToSave.galleryVideoTitle,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Save failed");
      }
      setPersistedSnapshot(snapshotToSave);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-black text-warm-deep">Photos</h1>
        <p className="mt-1 text-sm font-bold text-warm-textMuted">
          Manage your gallery and your About Us photo. Save when you are ready.
        </p>
      </header>

      <GalleryEditor
        images={images}
        onChange={setImages}
        variant="owner"
        enableHeroPromotion={false}
      />

      <GalleryVideoEditor
        value={galleryVideoUrl}
        title={galleryVideoTitle}
        onChange={setGalleryVideoUrl}
        onTitleChange={setGalleryVideoTitle}
        variant="owner"
      />

      <AboutImagePicker
        value={aboutImageUrl}
        gallery={images}
        onChange={setAboutImageUrl}
        variant="owner"
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="sticky bottom-24 md:bottom-4 z-30 flex items-center justify-end gap-3">
        {savedAt && !dirty && (
          <span className="text-xs font-bold text-green-700">Saved.</span>
        )}
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-full bg-pop-pink px-5 py-3 text-sm font-black text-pop-cream shadow-lg transition hover:bg-pink-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
