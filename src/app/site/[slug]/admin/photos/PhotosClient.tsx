"use client";

import { useState } from "react";
import { GalleryEditor } from "../_components/GalleryEditor";

interface PhotosClientProps {
  initialImages: string[];
}

export function PhotosClient({ initialImages }: PhotosClientProps) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const initialJson = JSON.stringify(initialImages);
  const dirty = JSON.stringify(images) !== initialJson;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Save failed");
      }
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
          Upload photos that appear on your website&apos;s gallery and hero. Save when you are ready.
        </p>
      </header>

      <GalleryEditor
        images={images}
        onChange={setImages}
        variant="owner"
        enableHeroPromotion={false}
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
