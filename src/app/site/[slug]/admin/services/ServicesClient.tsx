"use client";

import { useMemo, useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { ServiceRow } from "../_components/ServiceRow";
import { CategoriesPanel } from "./CategoriesPanel";
import { BookingPoliciesEditor } from "./BookingPoliciesEditor";

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
    // Lazy backfill — assign a stable client_id to any service that doesn't
    // have one yet, so React keys survive renames.
    client_id: s.client_id ?? crypto.randomUUID(),
  };
}

interface ServicesClientProps {
  initialServices: ServiceItem[];
  initialCategories: string[];
  initialBookingPolicies: string;
}

export function ServicesClient({ initialServices, initialCategories, initialBookingPolicies }: ServicesClientProps) {
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
  const [categories, setCategories] = useState<string[]>(initialCategories);
  const [bookingPolicies, setBookingPolicies] = useState<string>(initialBookingPolicies);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failingIndexes, setFailingIndexes] = useState<Set<number>>(new Set());
  const [showTruncatedNotice, setShowTruncatedNotice] = useState(truncatedIndexes.size > 0);
  // Bumped on Save click to force every ServiceRow back to its compact
  // collapsed view. Failing rows re-expand themselves via their `failing`
  // prop; the rest stay tidy after a save.
  const [collapseSignal, setCollapseSignal] = useState(0);

  const initialJson = JSON.stringify({ services: normalizedInitial, categories: initialCategories, bookingPolicies: initialBookingPolicies });
  const dirty = JSON.stringify({ services, categories, bookingPolicies }) !== initialJson;

  // Per-category service counts for the categories panel.
  const counts = useMemo(() => {
    const out: Record<string, number> = { Other: 0 };
    services.forEach((s) => {
      if (s.category && categories.includes(s.category)) {
        out[s.category] = (out[s.category] ?? 0) + 1;
      } else {
        out.Other += 1;
      }
    });
    return out;
  }, [services, categories]);

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
    setFailingIndexes(new Set());
  }

  function add() {
    setServices((prev) => [
      ...prev,
      { name: "", price: "", duration_minutes: 60, client_id: crypto.randomUUID() },
    ]);
    setSavedAt(null);
  }

  // Categories panel callback — handles rename cascade and remove cascade
  // entirely client-side so the server only sees a single coherent payload.
  function handleCategoriesChange(
    next: string[],
    rename?: { from: string; to: string },
    removed?: string,
  ) {
    setCategories(next);
    if (rename) {
      setServices((prev) =>
        prev.map((s) => (s.category === rename.from ? { ...s, category: rename.to } : s)),
      );
    }
    if (removed) {
      setServices((prev) =>
        prev.map((s) => (s.category === removed ? { ...s, category: undefined } : s)),
      );
    }
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setCollapseSignal((s) => s + 1);
    setError(null);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services, categories, booking_policies: bookingPolicies }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errs = (data?.errors as Array<{ index: number; field: string; reason: string }> | undefined) ?? [];
        if (errs.length > 0) {
          const lines = errs.slice(0, 3).map((e) => {
            const rowLabel =
              e.index >= 0 && services[e.index]?.name
                ? `Row ${e.index + 1} (${services[e.index].name})`
                : e.index >= 0
                  ? `Row ${e.index + 1}`
                  : `Categories`;
            return `${rowLabel}: ${e.field} — ${e.reason}`;
          });
          if (errs.length > 3) lines.push(`…and ${errs.length - 3} more`);
          setError(lines.join("\n"));
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

      <CategoriesPanel
        categories={categories}
        counts={counts}
        onChange={handleCategoriesChange}
      />

      <BookingPoliciesEditor value={bookingPolicies} onChange={setBookingPolicies} />

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
            key={s.client_id ?? i}
            service={s}
            categories={categories}
            failing={failingIndexes.has(i)}
            collapseSignal={collapseSignal}
            onChange={(next) => update(i, next)}
            onDelete={() => remove(i)}
          />
        ))
      )}

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
