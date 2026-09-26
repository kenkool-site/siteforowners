"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { MemoryMedia } from "@/lib/invitations/memories/types";

type Tab = "live" | "flagged" | "removed" | "pending" | "published" | "rejected";
type Action = "approve" | "reject" | "remove";

export function OwnerMemoriesReviewQueue({ eventId, mode, initialLive, initialFlagged, initialRemoved, initialPending, initialPublished, initialRejected, mediaBasePath, backHref }: { eventId: string; mode: "auto_publish" | "review_required"; initialLive: MemoryMedia[]; initialFlagged: MemoryMedia[]; initialRemoved: MemoryMedia[]; initialPending: MemoryMedia[]; initialPublished: MemoryMedia[]; initialRejected: MemoryMedia[]; mediaBasePath: string; backHref?: string }) {
  const t = useTranslations("invitations.manage.memories");
  const [tab, setTab] = useState<Tab>(initialFlagged.length ? "flagged" : mode === "auto_publish" ? "live" : "pending");
  const [lists, setLists] = useState<Record<Tab, MemoryMedia[]>>({ live: initialLive, flagged: initialFlagged, removed: initialRemoved, pending: initialPending, published: initialPublished, rejected: initialRejected });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const tabs: Tab[] = mode === "auto_publish" ? ["live", "flagged", "removed"] : ["pending", "flagged", "published", "rejected"];
  const current = lists[tab];
  const selectedItems = useMemo(() => current.filter((item) => selected.has(item.id)), [current, selected]);

  async function act(action: Action, items: MemoryMedia[]) {
    if (!items.length) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/moderation`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, mediaIds: items.map((item) => item.id) }) });
      if (!response.ok) throw new Error(`moderation ${response.status}`);
      const ids = new Set(items.map((item) => item.id));
      setLists((previous) => {
        const next = Object.fromEntries(Object.entries(previous).map(([key, rows]) => [key, rows.filter((row) => !ids.has(row.id))])) as Record<Tab, MemoryMedia[]>;
        const target: Tab = action === "approve" ? (mode === "auto_publish" ? "live" : "published") : (mode === "auto_publish" ? "removed" : "rejected");
        next[target] = [...items.map((item) => ({ ...item, moderationStatus: action === "approve" ? "approved" as const : "rejected" as const })), ...next[target]];
        return next;
      });
      setSelected(new Set());
    } catch { setError(true); } finally { setBusy(false); }
  }

  async function deleteAllPermanently() {
    const items = current;
    if (!items.length) return;
    if (!window.confirm(t("deletePermanentlyConfirm", { count: items.length }))) return;
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/moderation`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ mediaIds: items.map((item) => item.id) }) });
      if (!response.ok) throw new Error(`delete ${response.status}`);
      const ids = new Set(items.map((item) => item.id));
      setLists((previous) => Object.fromEntries(Object.entries(previous).map(([key, rows]) => [key, rows.filter((row) => !ids.has(row.id))])) as Record<Tab, MemoryMedia[]>);
    } catch { setError(true); } finally { setBusy(false); }
  }

  async function download(mediaIds?: string[]) {
    setBusy(true); setError(false);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/download`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mediaIds ? { mediaIds } : {}) });
      if (!response.ok) throw new Error(`download ${response.status}`);
      const payload = await response.json() as { downloads: { fileName: string; url: string }[] };
      for (const item of payload.downloads) { const anchor = document.createElement("a"); anchor.href = item.url; anchor.download = item.fileName; document.body.appendChild(anchor); anchor.click(); anchor.remove(); }
    } catch { setError(true); } finally { setBusy(false); }
  }

  return <main className="min-h-screen bg-[#F7F4F8] px-4 py-6 text-[#2B2231] sm:px-6 sm:py-10">
    <div className="mx-auto max-w-6xl">
      {backHref && <Link href={backHref} className="text-sm font-semibold text-[#6D456F] underline underline-offset-4">{t("back")}</Link>}
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><h1 className="font-[family-name:var(--font-fraunces)] text-4xl font-medium tracking-[-0.03em]">{t("title")}</h1><p className="mt-2 text-sm text-[#675d6a]">{t("subtitle")}</p></div><button type="button" disabled={busy} onClick={() => void download()} className="min-h-11 rounded-md border border-[#6D456F] bg-white px-4 py-2 text-sm font-semibold text-[#55405a]">{t("downloadAll")}</button></div>
      <div className="mt-7 flex overflow-x-auto border-b border-[#cfc3d3]" aria-label={t("tabsLabel")}>{tabs.map((value) => <button key={value} type="button" onClick={() => { setTab(value); setSelected(new Set()); }} className={`min-h-12 shrink-0 border-b-2 px-4 text-sm font-semibold ${tab === value ? "border-[#6D456F] text-[#4A3150]" : "border-transparent text-[#675d6a]"}`}>{t(`tabs.${value}`)}{value === "flagged" && lists.flagged.length > 0 ? ` (${lists.flagged.length})` : ""}</button>)}</div>
      {(tab === "pending" || tab === "flagged") && current.length > 0 && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy || selected.size === 0} onClick={() => void act("approve", selectedItems)} className="min-h-11 rounded-md bg-[#6D456F] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">{t("bulkApprove")}</button><button type="button" disabled={busy || selected.size === 0} onClick={() => void act("reject", selectedItems)} className="min-h-11 rounded-md border border-[#6D456F] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] disabled:opacity-40">{t("bulkReject")}</button><button type="button" disabled={busy || selected.size === 0} onClick={() => void download(Array.from(selected))} className="min-h-11 rounded-md border border-[#b9aabc] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] disabled:opacity-40">{t("downloadSelected")}</button></div>}
      {(tab === "removed" || tab === "rejected") && current.length > 0 && <div className="mt-4 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void deleteAllPermanently()} className="min-h-11 rounded-md border border-red-700 bg-white px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-40">{t("deleteAllPermanently")}</button></div>}
      {error && <p role="alert" className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{t("actionError")}</p>}
      {current.length === 0 ? <div className="mt-6 rounded-lg border border-dashed border-[#cfc3d3] bg-white p-8 text-center text-sm text-[#675d6a]">{t("empty")}</div> : <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{current.map((item) => <li key={item.id} className="overflow-hidden rounded-lg border border-[#cfc3d3] bg-white">
        <div className="relative aspect-square bg-[#ede8ef]">{item.objectKeyThumbnail && <img src={`${mediaBasePath}/${item.id}/thumbnail`} alt="" className="size-full object-cover" />}{(tab === "pending" || tab === "flagged") && <label className="absolute left-2 top-2 flex size-11 items-center justify-center rounded-full bg-white/95 shadow"><input type="checkbox" aria-label={t("selectPhoto", { name: item.uploaderDisplayName ?? t("anonymous") })} checked={selected.has(item.id)} onChange={(event) => setSelected((previous) => { const next = new Set(previous); if (event.target.checked) next.add(item.id); else next.delete(item.id); return next; })} className="size-5 accent-[#6D456F]" /></label>}</div>
        <div className="p-3"><p className="truncate text-sm font-semibold">{item.uploaderDisplayName ?? t("anonymous")}</p><p className="mt-1 text-xs text-[#675d6a]">{new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.uploadedAt))}</p>{tab === "live" && <button type="button" disabled={busy} onClick={() => void act("remove", [item])} className="mt-3 min-h-10 text-sm font-semibold text-red-700">{t("remove")}</button>}</div>
      </li>)}</ul>}
    </div>
  </main>;
}
