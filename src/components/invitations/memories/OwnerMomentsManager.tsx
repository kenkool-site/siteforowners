"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";

export function OwnerMomentsManager({ eventId, initialMoments }: { eventId: string; initialMoments: MemoryMoment[] }) {
  const t = useTranslations("invitations.manage.memories.moments");
  const [moments, setMoments] = useState<MemoryMoment[]>(initialMoments);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addMoment() {
    if (!name.trim() || !startsAt || !endsAt) return;
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError(t("endsBeforeStarts"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/moments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          startsAt: new Date(startsAt).toISOString(),
          endsAt: new Date(endsAt).toISOString(),
          sortOrder: moments.length,
        }),
      });
      if (!response.ok) throw new Error(`moments ${response.status}`);
      const { moment } = (await response.json()) as { moment: MemoryMoment };
      setMoments((previous) => [...previous, moment]);
      setName("");
      setStartsAt("");
      setEndsAt("");
    } catch {
      setError(t("error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 rounded-lg border border-[#cfc3d3] bg-white p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-[#675d6a]">{t("description")}</p>

      {moments.length === 0 ? (
        <p className="mt-3 text-sm text-[#675d6a]">{t("empty")}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {moments.map((moment) => (
            <li key={moment.id} className="rounded-md border border-[#e5dde8] px-3 py-2 text-sm">
              <span className="font-medium">{moment.name}</span>{" "}
              <span className="text-[#675d6a]">
                {new Date(moment.startsAt).toLocaleString()} – {new Date(moment.endsAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
        <label className="flex flex-col gap-1 text-sm">
          {t("nameLabel")}
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("namePlaceholder")}
            maxLength={80}
            className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("startsAtLabel")}
          <input
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          {t("endsAtLabel")}
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={() => void addMoment()}
          disabled={busy || !name.trim() || !startsAt || !endsAt}
          className="min-h-11 rounded-md bg-[#6D456F] px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {busy ? t("adding") : t("add")}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
