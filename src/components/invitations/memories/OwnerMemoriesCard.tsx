"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MemoriesEventSummary } from "@/lib/invitations/memories/host";

export type OwnerMemoriesCardData = MemoriesEventSummary & { enabled: boolean; mode: "auto_publish" | "review_required"; findMeEnabled: boolean };

export function OwnerMemoriesCard({ eventId, slug, initial, manageBasePath = "/invitations/manage" }: { eventId: string; slug: string; initial: OwnerMemoriesCardData; manageBasePath?: string }) {
  const t = useTranslations("invitations.manage.dashboard.memories");
  const [enabled, setEnabled] = useState(initial.enabled);
  const [mode, setMode] = useState(initial.mode);
  const [findMeEnabled, setFindMeEnabled] = useState(initial.findMeEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function save(body: Record<string, unknown>, rollback: () => void) {
    setSaving(true); setError(false);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/settings`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error(`settings ${response.status}`);
    } catch { rollback(); setError(true); } finally { setSaving(false); }
  }

  return <section className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
    <div className="overflow-hidden rounded-lg border border-[#cfc3d3] bg-white">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold">{t("title")}</h2>{initial.flaggedCount > 0 && <span className="rounded-full bg-[#6D456F] px-2.5 py-1 text-xs font-semibold text-white">{t("flagged", { count: initial.flaggedCount })}</span>}</div>
          <p className="mt-1 text-sm text-[#675d6a]">{t("summary", { photos: initial.photoCount, videos: initial.videoCount, guests: initial.guestContributorCount })}</p>
          {initial.recentThumbnailMediaIds.length > 0 && <div className="mt-3 flex max-w-full gap-1 overflow-hidden">{initial.recentThumbnailMediaIds.map((id) => <img key={id} src={`/api/invitations/events/${eventId}/memories/media/${id}/thumbnail`} alt="" className="size-12 shrink-0 rounded-md object-cover" />)}</div>}
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:flex">
          <Link href={`/invite/${slug}/memories`} className="inline-flex min-h-11 items-center justify-center rounded-md border border-[#6D456F] px-4 py-2 text-sm font-semibold text-[#55405a]">{t("viewGallery")}</Link>
          <Link href={`${manageBasePath}/${eventId}/memories`} className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#6D456F] px-4 py-2 text-sm font-semibold text-white">{initial.flaggedCount > 0 ? t("reviewFlagged") : t("manage")}</Link>
        </div>
      </div>
      <div className="grid gap-3 border-t border-[#e5dfe7] bg-[#F7F4F8] p-5 sm:grid-cols-2">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium"><input type="checkbox" checked={enabled} disabled={saving} onChange={(event) => { const previous = enabled; const next = event.target.checked; setEnabled(next); void save({ action: "set_enabled", enabled: next }, () => setEnabled(previous)); }} className="size-5 accent-[#6D456F]" />{t("enableLabel")}</label>
        <label className={`flex min-h-11 items-center gap-3 text-sm font-medium ${enabled ? "" : "opacity-50"}`}><input type="checkbox" checked={mode === "review_required"} disabled={saving || !enabled} onChange={(event) => { const previous = mode; const next = event.target.checked ? "review_required" : "auto_publish"; setMode(next); void save({ action: "set_mode", mode: next }, () => setMode(previous)); }} className="size-5 accent-[#6D456F]" />{t("modeLabel")}</label>
        <label className={`flex min-h-11 items-center gap-3 text-sm font-medium ${enabled ? "" : "opacity-50"}`}><input type="checkbox" checked={findMeEnabled} disabled={saving || !enabled} onChange={(event) => { const previous = findMeEnabled; const next = event.target.checked; setFindMeEnabled(next); void save({ action: "set_find_me_enabled", enabled: next }, () => setFindMeEnabled(previous)); }} className="size-5 accent-[#6D456F]" />{t("findMeEnableLabel")}</label>
        {error && <p role="alert" className="text-sm font-medium text-red-700 sm:col-span-2">{t("saveError")}</p>}
      </div>
    </div>
  </section>;
}
