"use client";

import { useRef, useState } from "react";
import Image from "next/image";

const variants = {
  owner: {
    container: "rounded-[1.5rem] border border-warm-cream1 bg-white p-5 shadow-sm",
    heading: "text-base font-black text-warm-deep",
    upload:
      "cursor-pointer rounded-full bg-pop-pink px-4 py-2 text-xs font-black text-pop-cream transition hover:bg-pink-700 disabled:opacity-50",
    hint: "text-[11px] font-bold text-warm-textMuted",
    heroBadgeBg: "bg-pop-pink",
    heroRing: "border-pop-pink ring-2 ring-pop-pink/30",
  },
  founder: {
    container: "rounded-xl border bg-white p-6",
    heading: "text-lg font-semibold text-gray-900",
    upload:
      "cursor-pointer text-sm font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50",
    hint: "text-xs text-gray-400",
    heroBadgeBg: "bg-amber-500",
    heroRing: "border-amber-500 ring-2 ring-amber-500/30",
  },
} as const;

export type GalleryEditorVariant = keyof typeof variants;

interface GalleryEditorProps {
  images: string[];
  onChange: (next: string[]) => void;
  variant: GalleryEditorVariant;
  /** When true, the first image renders with a "Hero" badge and tapping any
   * other image promotes it to position 0. Owner surface defaults to false
   * so owners can't accidentally rearrange their hero — founder handles it. */
  enableHeroPromotion?: boolean;
  /** Custom heading text. Defaults to "Photos". */
  heading?: string;
}

/**
 * Shared photo-gallery editor used by both the owner admin (`/admin/photos`)
 * and the founder edit page (`SiteEditor`). Lite scope: upload + delete +
 * (optional) one-tap promote-to-hero. No drag reorder.
 *
 * Uploads go to `/api/upload-images`; the parent owns the `images` array
 * and persists it (different endpoints per surface).
 */
export function GalleryEditor({
  images,
  onChange,
  variant,
  enableHeroPromotion = false,
  heading = "Photos",
}: GalleryEditorProps) {
  const st = variants[variant];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    const formData = new FormData();
    Array.from(files).forEach((f) => formData.append("images", f));
    try {
      const res = await fetch("/api/upload-images", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Upload failed");
      }
      const data = (await res.json()) as { urls: string[] };
      onChange([...images, ...data.urls]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeAt(index: number) {
    onChange(images.filter((_, i) => i !== index));
  }

  function promoteToHero(index: number) {
    if (!enableHeroPromotion || index === 0) return;
    const next = [...images];
    const [picked] = next.splice(index, 1);
    next.unshift(picked);
    onChange(next);
  }

  const hint = enableHeroPromotion
    ? "Click any image to set it as the hero background."
    : "First photo uploaded becomes the hero. Ask us if you want a different hero.";

  return (
    <section className={st.container}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className={st.heading}>{heading}</h2>
        <label className={st.upload}>
          {uploading ? "Uploading..." : "+ Upload"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={uploading}
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>
      <p className={"mb-3 " + st.hint}>{hint}</p>
      {error && (
        <p className="mb-3 text-xs font-bold text-red-600">{error}</p>
      )}
      {images.length === 0 ? (
        <p className={"py-6 text-center " + st.hint}>
          No photos yet. Upload some to get started.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((img, i) => {
            const isHero = enableHeroPromotion && i === 0;
            return (
              <div
                key={img}
                className={
                  "group relative aspect-square overflow-hidden rounded-lg border-2 transition-all " +
                  (isHero
                    ? st.heroRing
                    : "border-transparent " +
                      (enableHeroPromotion ? "cursor-pointer hover:border-gray-300" : ""))
                }
                onClick={() => promoteToHero(i)}
              >
                <Image src={img} alt="" fill className="object-cover" unoptimized />
                {isHero && (
                  <span
                    className={
                      "absolute left-1.5 top-1.5 rounded px-2 py-0.5 text-[10px] font-semibold text-white shadow " +
                      st.heroBadgeBg
                    }
                  >
                    Hero
                  </span>
                )}
                <button
                  type="button"
                  aria-label="Remove photo"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAt(i);
                  }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-xs text-white shadow opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
