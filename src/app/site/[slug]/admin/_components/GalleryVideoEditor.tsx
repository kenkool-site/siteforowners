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
