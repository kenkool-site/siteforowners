"use client";

import { useRef, useState } from "react";
import Image from "next/image";

const variants = {
  owner: {
    container: "rounded-[1.5rem] border border-warm-cream1 bg-white p-5 shadow-sm",
    heading: "text-base font-black text-warm-deep",
    hint: "text-[11px] font-bold text-warm-textMuted",
    uploadBtn:
      "inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-pop-pink/50 px-3 py-2 text-xs font-black text-pop-pink hover:bg-pink-50 disabled:opacity-50",
    selectedRing: "border-pop-pink ring-2 ring-pop-pink/30",
    privacyTag:
      "inline-block rounded-full bg-pop-pink/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-pop-pink",
  },
  founder: {
    container: "rounded-xl border bg-white p-6",
    heading: "text-lg font-semibold text-gray-900",
    hint: "text-xs text-gray-500",
    uploadBtn:
      "inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-gray-500 hover:border-amber-400 hover:text-amber-600 disabled:opacity-50",
    selectedRing: "border-amber-500 ring-2 ring-amber-500/30",
    privacyTag:
      "inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700",
  },
} as const;

export type AboutImagePickerVariant = keyof typeof variants;

interface AboutImagePickerProps {
  value: string | null;
  gallery: string[];
  onChange: (next: string | null) => void;
  variant: AboutImagePickerVariant;
}

/**
 * About-Us image picker. Used by the owner admin (`/admin/photos`) and the
 * founder edit page (`SiteEditor`). Two ways to set the image:
 *
 *   1. Upload a new photo — uploaded to the preview-images bucket and stored
 *      in section_settings.about_image_url ONLY. Does NOT add to the public
 *      gallery — keeps the personal owner photo out of customer-facing rails.
 *   2. Pick an existing gallery image — reuses a public photo if appropriate.
 *
 * Setting `value` to null clears the override (template default applies).
 */
export function AboutImagePicker({
  value,
  gallery,
  onChange,
  variant,
}: AboutImagePickerProps) {
  const st = variants[variant];
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("images", file);
    try {
      const res = await fetch("/api/upload-images", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Upload failed");
      }
      const data = (await res.json()) as { urls: string[] };
      const url = data.urls?.[0];
      if (url) onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <section className={st.container}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className={st.heading}>About Us photo</h2>
        <span className={st.privacyTag}>Not shown in gallery</span>
      </div>
      <p className={"mb-3 " + st.hint}>
        Pick one photo to show on your About Us section. Upload a new photo for a personal
        portrait, or pick from your gallery. Leave empty to use the template default.
      </p>

      <div className="flex items-center gap-3">
        {value ? (
          <div className="relative h-16 w-16 overflow-hidden rounded-xl border">
            <Image src={value} alt="" fill className="object-cover" unoptimized />
            <button
              type="button"
              aria-label="Clear About Us photo"
              onClick={() => onChange(null)}
              className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] text-white shadow"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed text-[10px] text-gray-400">
            None
          </div>
        )}
        <label className={st.uploadBtn}>
          {uploading ? "Uploading..." : "Upload new"}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={uploading}
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>

      {error && (
        <p className="mt-2 text-xs font-bold text-red-600">{error}</p>
      )}

      {gallery.length > 0 && (
        <div className="mt-4">
          <p className={"mb-2 " + st.hint}>Or pick from your gallery:</p>
          <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
            {gallery.map((img) => {
              const selected = value === img;
              return (
                <button
                  key={img}
                  type="button"
                  onClick={() => onChange(img)}
                  aria-label={selected ? "Selected as About image" : "Use as About image"}
                  className={
                    "relative aspect-square overflow-hidden rounded-md border-2 transition-all " +
                    (selected ? st.selectedRing : "border-transparent hover:border-gray-300")
                  }
                >
                  <Image src={img} alt="" fill className="object-cover" unoptimized />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
