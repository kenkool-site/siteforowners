"use client";

import { useState } from "react";
import Link from "next/link";
import { GalleryEditor } from "../_components/GalleryEditor";
import { GalleryVideoEditor } from "../_components/GalleryVideoEditor";

interface PhotosClientProps {
  initialImages: string[];
  initialGalleryVideoUrl: string | null;
  initialGalleryVideoTitle: string | null;
  initialMobileGallerySlider: boolean;
}

interface PhotosSnapshot {
  images: string[];
  galleryVideoUrl: string | null;
  galleryVideoTitle: string;
  mobileGallerySlider: boolean;
}

export function PhotosClient({
  initialImages,
  initialGalleryVideoUrl,
  initialGalleryVideoTitle,
  initialMobileGallerySlider,
}: PhotosClientProps) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [galleryVideoUrl, setGalleryVideoUrl] = useState<string | null>(initialGalleryVideoUrl);
  const [galleryVideoTitle, setGalleryVideoTitle] = useState(initialGalleryVideoTitle ?? "");
  const [mobileGallerySlider, setMobileGallerySlider] = useState(
    initialMobileGallerySlider,
  );
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialSnapshot: PhotosSnapshot = {
    images: initialImages,
    galleryVideoUrl: initialGalleryVideoUrl,
    galleryVideoTitle: initialGalleryVideoTitle ?? "",
    mobileGallerySlider: initialMobileGallerySlider,
  };
  const [persistedSnapshot, setPersistedSnapshot] = useState<PhotosSnapshot>(initialSnapshot);
  const currentSnapshot: PhotosSnapshot = {
    images,
    galleryVideoUrl,
    galleryVideoTitle,
    mobileGallerySlider,
  };
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
          gallery_video_url: snapshotToSave.galleryVideoUrl,
          gallery_video_title: snapshotToSave.galleryVideoTitle,
          mobile_gallery_slider: snapshotToSave.mobileGallerySlider,
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
          Manage your gallery photos and video. Save when you are ready.
        </p>
        <Link
          href="/admin/profile"
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-pink-50 px-4 text-xs font-black text-pop-pink transition hover:bg-pink-100"
        >
          Change About Us photo in Profile
        </Link>
      </header>

      <GalleryEditor
        images={images}
        onChange={setImages}
        variant="owner"
        enableHeroPromotion={false}
      />

      <section className="rounded-[1.5rem] border border-warm-cream1 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-black text-warm-deep">Mobile gallery slider</h2>
            <p className="mt-1 text-xs font-bold leading-5 text-warm-textMuted">
              Off shows a clean photo grid. Turn it on for a swipeable slider in Grand and Runway.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMobileGallerySlider((enabled) => !enabled)}
            aria-pressed={mobileGallerySlider}
            aria-label="Mobile gallery slider"
            className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
              mobileGallerySlider ? "bg-pop-pink" : "bg-warm-cream1"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                mobileGallerySlider ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </section>

      <GalleryVideoEditor
        value={galleryVideoUrl}
        title={galleryVideoTitle}
        onChange={setGalleryVideoUrl}
        onTitleChange={setGalleryVideoTitle}
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
