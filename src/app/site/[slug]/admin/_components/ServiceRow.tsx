"use client";

import { useEffect, useRef, useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { formatDuration } from "@/lib/availability";

interface ServiceRowProps {
  /** 1-indexed row number for display next to the name (helps owners find a
   * specific row when validation errors reference an index). */
  rowNumber?: number;
  service: ServiceItem;
  /** Owner page passes undefined; SiteEditor passes the founder tenant_id so
   * the upload endpoint can resolve the founder branch. */
  founderTenantId?: string;
  /** When true, force-expand the row, render a red border, and scroll into
   * view. Used after a failed save to surface the row that broke validation. */
  failing?: boolean;
  onChange: (next: ServiceItem) => void;
  onDelete: () => void;
}

export function ServiceRow({ rowNumber, service, founderTenantId, failing = false, onChange, onDelete }: ServiceRowProps) {
  // Auto-expand when the row is brand-new (no name yet), or when the parent
  // marks it as failing so the owner can see all the fields without a click.
  const [expanded, setExpanded] = useState(!service.name || failing);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // When the parent flips `failing` (after a save error), force-expand and
  // scroll the row into view so the owner can find the broken field.
  useEffect(() => {
    if (failing) {
      setExpanded(true);
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [failing]);

  const duration = service.duration_minutes ?? 60;

  function set<K extends keyof ServiceItem>(key: K, value: ServiceItem[K]) {
    onChange({ ...service, [key]: value });
  }

  async function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      if (founderTenantId) fd.append("tenant_id", founderTenantId);
      const res = await fetch("/api/admin/services/upload-image", { method: "POST", body: fd });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d?.error || "Upload failed");
        return;
      }
      const data = (await res.json()) as { url: string };
      set("image", data.url);
    } catch {
      alert("Network error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  if (!expanded) {
    return (
      <button
        ref={containerRef as unknown as React.RefObject<HTMLButtonElement>}
        type="button"
        onClick={() => setExpanded(true)}
        className={`w-full bg-white border rounded-lg px-3 py-3 flex items-center gap-3 text-left transition-colors ${
          failing ? "border-red-500 ring-2 ring-red-200" : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {service.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.image} alt="" className="h-12 w-12 rounded-md object-cover flex-shrink-0" />
        ) : (
          <div className="h-12 w-12 rounded-md bg-gray-100 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">
            {rowNumber !== undefined && (
              <span className="text-gray-400 font-normal mr-1">{rowNumber}.</span>
            )}
            {service.name || "(untitled)"}
          </div>
          <div className="text-xs text-gray-500">
            {formatDuration(duration)} · {service.price || "—"}
          </div>
        </div>
        <span className="text-gray-400">›</span>
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`bg-white border rounded-lg p-3 space-y-3 ${
        failing ? "border-red-500 ring-2 ring-red-200" : "border-[color:var(--admin-primary)]"
      }`}
    >
      {rowNumber !== undefined && (
        <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Row {rowNumber}
        </div>
      )}
      <div className="flex items-start gap-3">
        {/* Image picker */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-16 w-16 rounded-md flex items-center justify-center text-[10px] text-center flex-shrink-0 overflow-hidden border border-dashed border-gray-300 hover:border-gray-400"
          style={service.image ? { backgroundImage: `url(${service.image})`, backgroundSize: "cover", backgroundPosition: "center" } : { background: "#f3e8ff", color: "var(--admin-primary)" }}
        >
          {!service.image && (uploading ? "Uploading…" : "+ Image")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImagePick}
        />

        <div className="flex-1 space-y-2 min-w-0">
          <input
            type="text"
            value={service.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Service name"
            className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
            maxLength={60}
          />
          <div className="flex gap-2">
            <input
              type="text"
              value={service.price}
              onChange={(e) => set("price", e.target.value)}
              placeholder="$0"
              className="flex-1 rounded border border-gray-200 px-2 py-1.5 text-sm"
              maxLength={30}
            />
            <div className="flex items-center gap-1 rounded border border-gray-200 px-2">
              <button type="button" onClick={() => set("duration_minutes", Math.max(30, duration - 30))} aria-label="Decrease duration" className="px-1 text-gray-500">−</button>
              <span className="text-sm font-medium w-14 text-center tabular-nums">{formatDuration(duration)}</span>
              <button type="button" onClick={() => set("duration_minutes", Math.min(480, duration + 30))} aria-label="Increase duration" className="px-1 text-gray-500">+</button>
            </div>
          </div>
        </div>
      </div>

      <textarea
        value={service.description ?? ""}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Description (optional)"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
        rows={2}
        maxLength={200}
      />

      <div className="flex items-center justify-between pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-600">Delete this service?</span>
            <button type="button" onClick={onDelete} className="text-red-600 font-medium underline">
              Confirm
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-500 underline">
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-red-600">
            Delete
          </button>
        )}
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-500">
          ▾ Collapse
        </button>
      </div>
    </div>
  );
}
