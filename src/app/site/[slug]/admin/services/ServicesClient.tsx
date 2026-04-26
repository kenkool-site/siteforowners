"use client";

import { useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { ServiceRow } from "../_components/ServiceRow";

interface ServicesClientProps {
  initialServices: ServiceItem[];
}

export function ServicesClient({ initialServices }: ServicesClientProps) {
  const [services, setServices] = useState<ServiceItem[]>(initialServices);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track whether the on-screen array differs from the last saved snapshot.
  const initialJson = JSON.stringify(initialServices);
  const dirty = JSON.stringify(services) !== initialJson;

  function update(index: number, next: ServiceItem) {
    setServices((prev) => prev.map((s, i) => (i === index ? next : s)));
    setSavedAt(null);
  }

  function remove(index: number) {
    setServices((prev) => prev.filter((_, i) => i !== index));
    setSavedAt(null);
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
        } else {
          setError(data?.error || "Save failed");
        }
        return;
      }
      setSavedAt(Date.now());
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 pb-24">
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
          <ServiceRow key={i} service={s} onChange={(next) => update(i, next)} onDelete={() => remove(i)} />
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
