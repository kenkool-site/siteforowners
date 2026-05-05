"use client";

import { useMemo, useState } from "react";
import type { ServiceItem } from "@/lib/ai/types";
import { ServiceRow } from "../_components/ServiceRow";
import { CategoriesPanel } from "./CategoriesPanel";
import { BookingPoliciesEditor } from "./BookingPoliciesEditor";
import { DepositEditor, type DepositSettingsState } from "./DepositEditor";

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
  initialDeposit: DepositSettingsState;
}

export function ServicesClient({
  initialServices,
  initialCategories,
  initialBookingPolicies,
  initialDeposit,
}: ServicesClientProps) {
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
  const [deposit, setDeposit] = useState<DepositSettingsState>(initialDeposit);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failingIndexes, setFailingIndexes] = useState<Set<number>>(new Set());
  const [showTruncatedNotice, setShowTruncatedNotice] = useState(truncatedIndexes.size > 0);
  // Bumped on Save click to force every ServiceRow back to its compact
  // collapsed view. Failing rows re-expand themselves via their `failing`
  // prop; the rest stay tidy after a save.
  const [collapseSignal, setCollapseSignal] = useState(0);

  const initialJson = JSON.stringify({
    services: normalizedInitial,
    categories: initialCategories,
    bookingPolicies: initialBookingPolicies,
    deposit: initialDeposit,
  });
  const dirty = JSON.stringify({ services, categories, bookingPolicies, deposit }) !== initialJson;

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
        body: JSON.stringify({
          services,
          categories,
          booking_policies: bookingPolicies,
          deposit_required: deposit.deposit_required,
          deposit_mode: deposit.deposit_mode,
          deposit_value: deposit.deposit_value,
          deposit_cashapp: deposit.deposit_cashapp,
          deposit_zelle: deposit.deposit_zelle,
          deposit_other_label: deposit.deposit_other_label,
          deposit_other_value: deposit.deposit_other_value,
        }),
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
    <div className="space-y-4 pb-24 md:space-y-5">
      <section className="overflow-hidden rounded-3xl bg-warm-deep text-pop-cream shadow-sm md:rounded-[2rem]">
        <div className="grid gap-5 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_16rem] md:p-8">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-pop-pink">Services</p>
            <h1 className="mt-2 max-w-2xl font-serif text-3xl font-black leading-[0.95] tracking-[-0.045em] sm:text-4xl md:text-5xl">
              What clients book on your site.
            </h1>
            <p className="mt-4 max-w-2xl text-sm font-bold leading-6 text-pop-cream/70">
              Edit offerings, categories, booking notes, and deposits. Save when you are ready — changes go live for your booking flow.
            </p>
          </div>
          <div className="rounded-[1.5rem] border border-pop-cream/15 bg-pop-cream/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-pink-200">At a glance</p>
            <div className="mt-3 text-4xl font-black leading-none md:text-5xl">{services.length}</div>
            <div className="mt-1 text-sm font-bold text-pop-cream/70">
              {services.length === 1 ? "service" : "services"}
              {categories.length > 0 ? ` · ${categories.length} ${categories.length === 1 ? "category" : "categories"}` : ""}
            </div>
          </div>
        </div>
      </section>

      {showTruncatedNotice && (
        <div className="flex items-start gap-2 rounded-[1.5rem] border border-orange-200 bg-orange-50 p-3 text-xs font-bold text-orange-950">
          <span className="sr-only">Note</span>
          <span aria-hidden className="mt-0.5 font-black text-orange-600">
            !
          </span>
          <div className="flex-1">
            <span className="font-black">
              {truncatedIndexes.size} {truncatedIndexes.size === 1 ? "service was" : "services were"} shortened
            </span>{" "}
            to fit current limits (name ≤ {MAX_NAME}, price ≤ {MAX_PRICE}, description ≤ {MAX_DESCRIPTION} chars). Review the rows below
            before saving — you can edit them now.
          </div>
          <button
            type="button"
            onClick={() => setShowTruncatedNotice(false)}
            className="font-black text-orange-800 hover:text-orange-950"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}

      <CategoriesPanel categories={categories} counts={counts} onChange={handleCategoriesChange} />

      <BookingPoliciesEditor value={bookingPolicies} onChange={setBookingPolicies} />

      <DepositEditor value={deposit} onChange={setDeposit} />

      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-warm-textMuted">
          {services.length} {services.length === 1 ? "service" : "services"}
        </span>
        <button
          type="button"
          onClick={add}
          className="rounded-full bg-pop-pink px-4 py-2 text-xs font-black text-pop-cream transition hover:bg-pink-700"
        >
          + Add service
        </button>
      </div>

      {services.length === 0 ? (
        <div className="rounded-[1.75rem] border border-warm-cream1 bg-white p-6 text-center text-sm font-bold text-warm-textMuted">
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

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 px-3 md:bottom-4 md:px-8">
        <div className="pointer-events-auto mx-auto flex max-w-3xl flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          {error && (
            <span className="max-w-full whitespace-pre-line text-right text-[11px] font-bold text-red-600 sm:max-w-md">
              {error}
            </span>
          )}
          {savedAt && !dirty && (
            <span className="text-center text-xs font-black text-green-700 sm:text-right">✓ Saved</span>
          )}
          <button
            type="button"
            disabled={!dirty || saving}
            onClick={save}
            className="w-full rounded-full bg-pop-pink px-5 py-2.5 text-sm font-black text-pop-cream shadow-lg disabled:opacity-50 sm:w-auto"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
