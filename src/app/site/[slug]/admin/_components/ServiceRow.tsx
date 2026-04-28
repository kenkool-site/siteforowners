"use client";

import { useEffect, useRef, useState } from "react";
import type { ServiceItem, AddOn } from "@/lib/ai/types";
import { formatDuration } from "@/lib/availability";

interface ServiceRowProps {
  service: ServiceItem;
  /** Owner-managed list; passed so the dropdown can render options. */
  categories?: string[];
  founderTenantId?: string;
  failing?: boolean;
  /** Increment from parent (e.g. on Save click) to force this row to
   * collapse to the compact view. Failing rows ignore this — they
   * auto-re-expand via the `failing` effect below. */
  collapseSignal?: number;
  onChange: (next: ServiceItem) => void;
  onDelete: () => void;
}

const MAX_ADD_ONS = 10;

/**
 * Add-on price input. Wraps a controlled number input so the displayed
 * text doesn't lock to the parent state — lets the user type decimals
 * and clear the field without the placeholder "0" reappearing mid-edit.
 */
function PriceDeltaInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  className?: string;
}) {
  const [text, setText] = useState<string>(value === 0 ? "" : String(value));
  return (
    <input
      type="number"
      min={0}
      step="0.01"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const v = e.target.value;
        setText(v);
        const parsed = parseFloat(v);
        onChange(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0);
      }}
      placeholder="0"
      className={className}
    />
  );
}

const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

/**
 * Hours + minutes duration picker. Owners pick hours and minutes
 * independently from two compact dropdowns — no mental math from raw
 * minute counts. 5-minute granularity (the lowest realistic step in
 * salon scheduling). `variant="addon"` prefixes a "+" since add-ons
 * add to the base.
 */
function DurationMinutesInput({
  value,
  min,
  max,
  variant = "service",
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  variant?: "service" | "addon";
  onChange: (next: number) => void;
}) {
  const isAddOn = variant === "addon";
  // Snap incoming value to the nearest 5 for display (legacy non-multiple-of-5
  // values still render cleanly; first edit will commit a snapped value).
  const snapped = Math.round(value / 5) * 5;
  const hours = Math.max(0, Math.floor(snapped / 60));
  const minutes = Math.max(0, snapped % 60);
  const maxHours = Math.floor(max / 60);

  function commit(h: number, m: number) {
    const total = Math.max(min, Math.min(max, h * 60 + m));
    onChange(total);
  }

  return (
    <div className="flex items-center gap-1 rounded border border-gray-200 px-1.5 py-1 text-sm">
      {isAddOn && <span className="text-xs text-gray-500">+</span>}
      <select
        value={hours}
        onChange={(e) => commit(parseInt(e.target.value, 10), minutes)}
        aria-label="Hours"
        className="bg-transparent tabular-nums focus:outline-none"
      >
        {Array.from({ length: maxHours + 1 }, (_, i) => (
          <option key={i} value={i}>{i}</option>
        ))}
      </select>
      <span className="text-xs text-gray-500">h</span>
      <select
        value={minutes}
        onChange={(e) => commit(hours, parseInt(e.target.value, 10))}
        aria-label="Minutes"
        className="bg-transparent tabular-nums focus:outline-none"
      >
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
      <span className="text-xs text-gray-500">m</span>
    </div>
  );
}

export function ServiceRow({
  service,
  categories = [],
  founderTenantId,
  failing = false,
  collapseSignal = 0,
  onChange,
  onDelete,
}: ServiceRowProps) {
  const [expanded, setExpanded] = useState(!service.name || failing);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (failing) {
      setExpanded(true);
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [failing]);

  // Parent bumps collapseSignal (e.g. on Save click) to fold every row
  // back to its compact view. Skipped for failing rows — they auto-expand
  // via the `failing` effect above.
  useEffect(() => {
    if (collapseSignal > 0 && !failing) {
      setExpanded(false);
      setConfirmDelete(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapseSignal]);

  const duration = service.duration_minutes ?? 60;
  const addOns: AddOn[] = service.add_ons ?? [];

  function set<K extends keyof ServiceItem>(key: K, value: ServiceItem[K]) {
    onChange({ ...service, [key]: value });
  }

  function setAddOn(index: number, next: AddOn) {
    const updated = addOns.map((a, i) => (i === index ? next : a));
    onChange({ ...service, add_ons: updated });
  }

  function removeAddOn(index: number) {
    const updated = addOns.filter((_, i) => i !== index);
    onChange({ ...service, add_ons: updated.length > 0 ? updated : undefined });
  }

  function addAddOn() {
    if (addOns.length >= MAX_ADD_ONS) return;
    const updated = [...addOns, { name: "", price_delta: 0, duration_delta_minutes: 0 }];
    onChange({ ...service, add_ons: updated });
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
            {service.name || "(untitled)"}
          </div>
          <div className="text-xs text-gray-500">
            {formatDuration(duration)} · {service.price || "—"}
            {service.category && <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--admin-primary)]">{service.category}</span>}
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
      <div className="flex items-start gap-3">
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
            maxLength={80}
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
            <DurationMinutesInput
              value={duration}
              min={5}
              max={600}
              onChange={(next) => set("duration_minutes", next)}
            />
          </div>

          {/* Category dropdown — only when categories are defined */}
          {categories.length > 0 ? (
            <select
              value={service.category ?? ""}
              onChange={(e) => set("category", e.target.value || undefined)}
              className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm bg-white"
            >
              <option value="">(no category)</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          ) : (
            <div className="text-[10px] text-gray-500 italic">
              Tip: add categories above to group services
            </div>
          )}
        </div>
      </div>

      <textarea
        value={service.description ?? ""}
        onChange={(e) => set("description", e.target.value)}
        placeholder="Description (optional) — owners can write up to ~5 paragraphs"
        className="w-full rounded border border-gray-200 px-2 py-1.5 text-sm"
        rows={4}
        maxLength={1000}
      />

      {/* Add-ons editor */}
      <div className="border-t border-gray-100 pt-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
            Add-ons {addOns.length > 0 && <span className="text-gray-400 font-normal">({addOns.length}/{MAX_ADD_ONS})</span>}
          </span>
          <button
            type="button"
            onClick={addAddOn}
            disabled={addOns.length >= MAX_ADD_ONS}
            className="text-xs text-[var(--admin-primary)] font-medium disabled:opacity-50"
          >
            + Add add-on
          </button>
        </div>
        {addOns.map((ao, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={ao.name}
              onChange={(e) => setAddOn(i, { ...ao, name: e.target.value })}
              placeholder="Add-on name"
              className="flex-1 rounded border border-gray-200 px-2 py-1 text-xs"
              maxLength={80}
            />
            <DurationMinutesInput
              value={ao.duration_delta_minutes}
              min={0}
              max={240}
              variant="addon"
              onChange={(next) => setAddOn(i, { ...ao, duration_delta_minutes: next })}
            />
            <PriceDeltaInput
              value={ao.price_delta}
              onChange={(next) => setAddOn(i, { ...ao, price_delta: next })}
              className="w-20 rounded border border-gray-200 px-2 py-1 text-xs"
            />
            <button
              type="button"
              onClick={() => removeAddOn(i)}
              aria-label="Remove add-on"
              className="text-gray-400 hover:text-red-600 px-1"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between pt-1">
        {confirmDelete ? (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-red-600">Delete this service?</span>
            <button type="button" onClick={onDelete} className="text-red-600 font-medium underline">Confirm</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-gray-500 underline">Cancel</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-red-600">Delete</button>
        )}
        <button type="button" onClick={() => setExpanded(false)} className="text-xs text-gray-500">▾ Collapse</button>
      </div>
    </div>
  );
}
