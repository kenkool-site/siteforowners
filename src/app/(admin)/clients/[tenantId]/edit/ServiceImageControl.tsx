"use client";

import { useRef, useState } from "react";
import { SERVICE_IMAGE_FILES } from "@/lib/templates/service-image-manifest";

const HOME_SERVICES_DEFAULTS = Object.entries(SERVICE_IMAGE_FILES)
  .filter(([key]) => key.startsWith("home_services/"))
  .map(([, path]) => path);

/**
 * Image picker for a home-services service row: upload to the service-images
 * bucket, or pick one of the shipped defaults from
 * public/defaults/services/home_services/ (picker hidden while that folder is
 * empty). Clearing falls back to the render-time slug match, if any.
 */
export function ServiceImageControl({
  image,
  tenantId,
  onChange,
}: {
  image: string | undefined;
  tenantId: string;
  onChange: (next: string | undefined) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState("");

  const handlePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (tenantId) fd.append("tenant_id", tenantId);
      const res = await fetch("/api/admin/services/upload-image", { method: "POST", body: fd });
      const data: unknown = await res.json().catch(() => ({}));
      const body = (data ?? {}) as { url?: unknown; error?: unknown };
      if (!res.ok || typeof body.url !== "string") {
        setError(typeof body.error === "string" ? body.error : "Upload failed");
        return;
      }
      onChange(body.url);
    } catch {
      setError("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div>
      <div className="flex items-start gap-3">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" className="h-16 w-24 rounded-lg border border-gray-200 object-cover" />
        ) : (
          <div className="flex h-16 w-24 items-center justify-center rounded-lg border border-dashed border-gray-200 text-xs text-gray-400">
            No image
          </div>
        )}
        <div className="flex flex-col gap-1 text-sm">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="text-left font-medium text-amber-700 hover:text-amber-900 disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload image"}
          </button>
          {HOME_SERVICES_DEFAULTS.length > 0 && (
            <button
              type="button"
              onClick={() => setPickerOpen((open) => !open)}
              className="text-left font-medium text-amber-700 hover:text-amber-900"
            >
              {pickerOpen ? "Hide defaults" : "Choose default"}
            </button>
          )}
          {image && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="text-left text-xs text-red-600 hover:text-red-800"
            >
              Remove image
            </button>
          )}
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handlePick}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {pickerOpen && (
        <div className="mt-2 grid grid-cols-3 gap-2 rounded-lg border border-gray-100 p-2 sm:grid-cols-5">
          {HOME_SERVICES_DEFAULTS.map((path) => (
            <button
              key={path}
              type="button"
              onClick={() => {
                onChange(path);
                setPickerOpen(false);
              }}
              className={`overflow-hidden rounded-md border-2 ${
                image === path ? "border-amber-500" : "border-transparent hover:border-amber-300"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={path} alt="" className="aspect-[16/10] w-full object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
