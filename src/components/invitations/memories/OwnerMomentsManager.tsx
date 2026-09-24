"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { MemoryMoment } from "@/lib/invitations/memories/repository";

const MAX_NAME_LENGTH = 80;

// datetime-local inputs work in the browser's local timezone and expect
// "YYYY-MM-DDTHH:mm" with no offset — round-tripping an ISO startsAt/endsAt
// back into the edit form needs the same local getters new Date(iso) already
// uses, matching how the add form's own new Date(localValue) submission works.
function toDatetimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OwnerMomentsManager({ eventId, initialMoments }: { eventId: string; initialMoments: MemoryMoment[] }) {
  const t = useTranslations("invitations.manage.memories.moments");
  const basePath = `/api/invitations/events/${eventId}/memories/moments`;
  const [moments, setMoments] = useState<MemoryMoment[]>(initialMoments);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingMomentId, setEditingMomentId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editStartsAt, setEditStartsAt] = useState("");
  const [editEndsAt, setEditEndsAt] = useState("");
  const [busyMomentId, setBusyMomentId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  async function addMoment() {
    if (!name.trim() || !startsAt || !endsAt) return;
    if (Date.parse(endsAt) <= Date.parse(startsAt)) {
      setError(t("endsBeforeStarts"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(basePath, {
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

  function startEditing(moment: MemoryMoment) {
    setEditingMomentId(moment.id);
    setEditName(moment.name);
    setEditStartsAt(toDatetimeLocalValue(moment.startsAt));
    setEditEndsAt(toDatetimeLocalValue(moment.endsAt));
    setRowError(null);
  }

  async function saveEdit(moment: MemoryMoment) {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setRowError(t("nameRequired"));
      return;
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      setRowError(t("nameTooLong"));
      return;
    }
    if (!editStartsAt || !editEndsAt) return;
    if (Date.parse(editEndsAt) <= Date.parse(editStartsAt)) {
      setRowError(t("endsBeforeStarts"));
      return;
    }

    setBusyMomentId(moment.id);
    setRowError(null);
    try {
      const response = await fetch(basePath, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: moment.id,
          name: trimmedName,
          startsAt: new Date(editStartsAt).toISOString(),
          endsAt: new Date(editEndsAt).toISOString(),
        }),
      });
      if (!response.ok) throw new Error(`moments update ${response.status}`);
      setMoments((previous) =>
        previous.map((candidate) =>
          candidate.id === moment.id
            ? { ...candidate, name: trimmedName, startsAt: new Date(editStartsAt).toISOString(), endsAt: new Date(editEndsAt).toISOString() }
            : candidate,
        ),
      );
      setEditingMomentId(null);
    } catch {
      setRowError(t("saveError"));
    } finally {
      setBusyMomentId(null);
    }
  }

  async function deleteMoment(moment: MemoryMoment) {
    if (typeof window !== "undefined" && !window.confirm(t("deleteConfirm"))) return;
    setBusyMomentId(moment.id);
    setRowError(null);
    try {
      const response = await fetch(basePath, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: moment.id }),
      });
      if (!response.ok) throw new Error(`moments delete ${response.status}`);
      setMoments((previous) => previous.filter((candidate) => candidate.id !== moment.id));
      if (editingMomentId === moment.id) setEditingMomentId(null);
    } catch {
      setRowError(t("deleteError"));
    } finally {
      setBusyMomentId(null);
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
              {editingMomentId === moment.id ? (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
                  <label className="flex flex-col gap-1 text-sm">
                    {t("nameLabel")}
                    <input
                      type="text"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      maxLength={MAX_NAME_LENGTH}
                      className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    {t("startsAtLabel")}
                    <input
                      type="datetime-local"
                      value={editStartsAt}
                      onChange={(event) => setEditStartsAt(event.target.value)}
                      className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    {t("endsAtLabel")}
                    <input
                      type="datetime-local"
                      value={editEndsAt}
                      onChange={(event) => setEditEndsAt(event.target.value)}
                      className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
                    />
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void saveEdit(moment)}
                      disabled={busyMomentId === moment.id}
                      className="min-h-11 rounded-md bg-[#6D456F] px-3 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {t("save")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingMomentId(null)}
                      className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm font-semibold"
                    >
                      {t("cancel")}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span className="font-medium">{moment.name}</span>{" "}
                    <span className="text-[#675d6a]">
                      {new Date(moment.startsAt).toLocaleString()} – {new Date(moment.endsAt).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      aria-label={t("editFor", { name: moment.name })}
                      onClick={() => startEditing(moment)}
                      disabled={busyMomentId === moment.id}
                      className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm"
                    >
                      {t("edit")}
                    </button>
                    <button
                      type="button"
                      aria-label={t("deleteFor", { name: moment.name })}
                      onClick={() => void deleteMoment(moment)}
                      disabled={busyMomentId === moment.id}
                      className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm text-red-700"
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {rowError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {rowError}
        </p>
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
