"use client";

import { useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { ServiceRow } from "../_components/ServiceRow";

// Mirror the server caps so we can pre-truncate legacy/AI-generated data
// before the owner sees it. Saving fields longer than these will succeed
// regardless (the server also truncates), but applying the same caps client-
// side keeps what the owner sees in the UI in sync with what gets stored.
const MAX_NAME = 80;
const MAX_PRICE = 30;
const MAX_DESCRIPTION = 1000;

function normalizeService(s: ServiceItem): ServiceItem {
  return {
    ...s,
    name: s.name.length > MAX_NAME ? s.name.slice(0, MAX_NAME) : s.name,
    price: s.price.length > MAX_PRICE ? s.price.slice(0, MAX_PRICE) : s.price,
    description:
      s.description && s.description.length > MAX_DESCRIPTION
        ? s.description.slice(0, MAX_DESCRIPTION)
        : s.description,
  };
}

interface ServicesClientProps {
  initialServices: ServiceItem[];
}

export function ServicesClient({ initialServices }: ServicesClientProps) {
  // Pre-truncate any legacy fields that exceed the current caps so the owner
  // sees the same shape that will be saved. We track which rows were affected
  // to surface a banner ("we shortened N rows").
  const truncatedIndexes = new Set<number>();
  initialServices.forEach((s, i) => {
    if (
      s.name.length > MAX_NAME ||
      s.price.length > MAX_PRICE ||
      (s.description && s.description.length > MAX_DESCRIPTION)
    ) {
      truncatedIndexes.add(i);
    }
  });
  const normalizedInitial = initialServices.map(normalizeService);

  const [services, setServices] = useState<ServiceItem[]>(normalizedInitial);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Indexes flagged by the most recent save attempt; ServiceRow uses this
  // to expand + highlight the broken rows + scroll the first one into view.
  const [failingIndexes, setFailingIndexes] = useState<Set<number>>(new Set());
  // Whether to show the "we shortened N rows" banner.
  const [showTruncatedNotice, setShowTruncatedNotice] = useState(truncatedIndexes.size > 0);

  // Track whether the on-screen array differs from the last saved snapshot.
  // Use the NORMALIZED initial as the baseline so the dirty-check doesn't
  // immediately mark the page dirty just because we truncated on load.
  const initialJson = JSON.stringify(normalizedInitial);
  const dirty = JSON.stringify(services) !== initialJson;

  function update(index: number, next: ServiceItem) {
    setServices((prev) => prev.map((s, i) => (i === index ? next : s)));
    setSavedAt(null);
    if (failingIndexes.has(index)) {
      const nextSet = new Set(failingIndexes);
      nextSet.delete(index);
      setFailingIndexes(nextSet);
    }
  }

  function remove(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
    setSavedAt(null);
    setFailingIndexes(new Set());  // indexes shift after delete; clear all
  }

  function add() {
    setServices((prev) => [...prev, { name: "", price: "", duration_minutes: 60 }]);
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Surface field-level validation errors so the owner can find the
        // failing row. Without this, "Save failed" hides which row is broken,
        // and a single bad row blocks the entire atomic save.
        const errs = (data?.errors as Array<{ index: number; field: string; reason: string }> | undefined) ?? [];
        if (errs.length > 0) {
          const lines = errs
            .slice(0, 3)
            .map((e) => {
              const rowLabel =
                e.index >= 0 && services[e.index]?.name
                  ? `Row ${e.index + 1} (${services[e.index].name})`
                  : `Row ${e.index + 1}`;
              return `${rowLabel}: ${e.field} — ${e.reason}`;
            });
          if (errs.length > 3) lines.push(`…and ${errs.length - 3} more`);
          setError(lines.join("\n"));
          // Mark the failing rows so ServiceRow expands + highlights them.
          setFailingIndexes(new Set(errs.map((e) => e.index).filter((i) => i >= 0)));
        } else {
          setError(data?.error || "Save failed");
          setFailingIndexes(new Set());
        }
        return;
      }
      setSavedAt(Date.now());
      setFailingIndexes(new Set());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pb-24">
      {showTruncatedNotice && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          <span aria-hidden>ℹ️</span>
          <div className="flex-1">
            <span className="font-semibold">{truncatedIndexes.size} {truncatedIndexes.size === 1 ? "service was" : "services were"} shortened</span> to fit current limits (name ≤ {MAX_NAME}, price ≤ {MAX_PRICE}, description ≤ {MAX_DESCRIPTION} chars). Review the rows below before saving — you can edit them now.
          </div>
          <button type="button" onClick={() => setShowTruncatedNotice(false)} className="text-amber-700 hover:text-amber-900" aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">{services.length} {services.length === 1 ? "service" : "services"}</span>
        <button
          type="button"
          onClick={add}
          className="text-sm bg-[var(--admin-primary)] text-white font-medium px-3 py-1.5 rounded-lg"
        >
          + Add service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          No services yet. Add your first service to start taking bookings.
        </div>
      ) : (
        services.map((s, i) => (
          <ServiceRow
            key={i}
            rowNumber={i + 1}
            service={s}
            failing={failingIndexes.has(i)}
            onChange={(next) => update(i, next)}
            onDelete={() => remove(i)}
          />
        ))
      )}

      {/* Sticky save bar */}
      <div className="fixed bottom-16 md:bottom-4 inset-x-0 px-4 md:px-8 pointer-events-none">
        <div className="max-w-3xl mx-auto flex items-center justify-end gap-3 pointer-events-auto">
          {error && (
            <span className="text-xs text-red-600 whitespace-pre-line max-w-md text-right">
              {error}
            </span>
          )}
          {savedAt && !dirty && <span className="text-xs text-green-700">✓ Saved</span>}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="bg-[var(--admin-primary)] text-white font-medium px-4 py-2 rounded-lg shadow-md disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
