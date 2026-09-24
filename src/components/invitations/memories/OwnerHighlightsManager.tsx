"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { HighlightMode, MemoryHighlightGroup } from "@/lib/invitations/memories/highlight-types";
import type { EventHighlightGenerationStatus } from "@/lib/invitations/memories/repository";

export type HostHighlightGroup = MemoryHighlightGroup & { mediaCount: number };

interface HighlightsOverviewResponse {
  mode: HighlightMode;
  generationStatus: EventHighlightGenerationStatus;
  lastGeneratedMediaCount: number;
  groups: HostHighlightGroup[];
}

export interface OwnerHighlightsManagerProps {
  eventId: string;
  initialMode: HighlightMode;
  initialGenerationStatus: EventHighlightGenerationStatus;
  initialLastGeneratedMediaCount: number;
  initialGroups: HostHighlightGroup[];
  // Test seam only: production always uses the real 3s cadence the plan
  // specifies (see DEFAULT_POLL_INTERVAL_MS); tests inject a much shorter
  // interval so polling behavior can be verified without a multi-second wait.
  pollIntervalMs?: number;
}

const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 300;
const DEFAULT_POLL_INTERVAL_MS = 3000;

export function OwnerHighlightsManager({
  eventId,
  initialMode,
  initialGenerationStatus,
  initialLastGeneratedMediaCount,
  initialGroups,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}: OwnerHighlightsManagerProps) {
  const t = useTranslations("invitations.manage.memories.highlights");
  const basePath = `/api/invitations/events/${eventId}/memories/highlights`;

  const [mode, setMode] = useState<HighlightMode>(initialMode);
  const [generationStatus, setGenerationStatus] = useState<EventHighlightGenerationStatus>(initialGenerationStatus);
  const [lastGeneratedMediaCount, setLastGeneratedMediaCount] = useState(initialLastGeneratedMediaCount);
  const [groups, setGroups] = useState<HostHighlightGroup[]>(initialGroups);

  const [busyMode, setBusyMode] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);
  const [busyGenerate, setBusyGenerate] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busyAdd, setBusyAdd] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busyGroupId, setBusyGroupId] = useState<string | null>(null);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  // Best-effort: on failure the host just keeps seeing the last-known status
  // until the next poll tick or their next manual action.
  async function refresh() {
    try {
      const response = await fetch(basePath);
      if (!response.ok) return;
      const data = (await response.json()) as HighlightsOverviewResponse;
      setMode(data.mode);
      setGenerationStatus(data.generationStatus);
      setLastGeneratedMediaCount(data.lastGeneratedMediaCount);
      setGroups(data.groups);
    } catch {
      // ignored — see comment above.
    }
  }

  // Only polls while a generation is actually in flight (queued/processing).
  // Re-runs whenever generationStatus changes, so the moment a poll's own
  // refresh() reports "idle" or "failed", this effect's condition goes
  // false and the interval is torn down rather than continuing forever.
  useEffect(() => {
    if (generationStatus !== "queued" && generationStatus !== "processing") return;
    const id = setInterval(() => {
      void refresh();
    }, pollIntervalMs);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationStatus, pollIntervalMs]);

  async function handleModeChange(nextMode: HighlightMode) {
    if (nextMode === mode || busyMode) return;
    setBusyMode(true);
    setModeError(null);
    try {
      const response = await fetch(basePath, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_mode", mode: nextMode }),
      });
      if (!response.ok) throw new Error(`set_mode ${response.status}`);
      setMode(nextMode);
      // The server best-effort queues a regeneration in the new mode after
      // its own write succeeds — refresh to pick up the resulting status
      // rather than guessing it here.
      await refresh();
    } catch {
      setModeError(t("modeError"));
    } finally {
      setBusyMode(false);
    }
  }

  async function handleGenerate() {
    if (busyGenerate || generationStatus === "queued" || generationStatus === "processing") return;
    setBusyGenerate(true);
    setGenerateError(null);
    try {
      const response = await fetch(`${basePath}/generate`, { method: "POST" });
      if (!response.ok) throw new Error(`generate ${response.status}`);
      const data = (await response.json()) as { generation: { status: EventHighlightGenerationStatus } };
      setGenerationStatus(data.generation.status);
    } catch {
      setGenerateError(t("generateError"));
    } finally {
      setBusyGenerate(false);
    }
  }

  async function handleAddGroup() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(t("nameRequired"));
      return;
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      setFormError(t("nameTooLong"));
      return;
    }
    const trimmedDescription = description.trim();
    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      setFormError(t("descriptionTooLong"));
      return;
    }

    setBusyAdd(true);
    setFormError(null);
    try {
      const response = await fetch(basePath, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmedName, description: trimmedDescription || undefined, sortOrder: groups.length }),
      });
      if (!response.ok) throw new Error(`create ${response.status}`);
      const { group: created } = (await response.json()) as { group: HostHighlightGroup };
      setGroups((previous) => [...previous, created]);
      setName("");
      setDescription("");
    } catch {
      setFormError(t("error"));
    } finally {
      setBusyAdd(false);
    }
  }

  async function patchGroup(id: string, updates: Record<string, unknown>): Promise<boolean> {
    setBusyGroupId(id);
    setGroupError(null);
    try {
      const response = await fetch(basePath, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "update_group", id, ...updates }),
      });
      if (!response.ok) throw new Error(`update_group ${response.status}`);
      return true;
    } catch {
      setGroupError(t("error"));
      return false;
    } finally {
      setBusyGroupId(null);
    }
  }

  async function handleSaveRename(target: HostHighlightGroup) {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setGroupError(t("nameRequired"));
      return;
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      setGroupError(t("nameTooLong"));
      return;
    }
    const trimmedDescription = editDescription.trim();
    if (trimmedDescription.length > MAX_DESCRIPTION_LENGTH) {
      setGroupError(t("descriptionTooLong"));
      return;
    }

    const nextDescription = trimmedDescription || null;
    const ok = await patchGroup(target.id, { name: trimmedName, description: nextDescription });
    if (ok) {
      setGroups((previous) =>
        previous.map((candidate) => (candidate.id === target.id ? { ...candidate, name: trimmedName, description: nextDescription } : candidate)),
      );
      setEditingGroupId(null);
    }
  }

  async function handleToggleVisibility(target: HostHighlightGroup) {
    const nextVisible = !target.isVisible;
    const ok = await patchGroup(target.id, { isVisible: nextVisible });
    if (ok) {
      setGroups((previous) => previous.map((candidate) => (candidate.id === target.id ? { ...candidate, isVisible: nextVisible } : candidate)));
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= groups.length) return;
    const current = groups[index];
    const swapWith = groups[targetIndex];
    const [okCurrent, okSwapWith] = await Promise.all([
      patchGroup(current.id, { sortOrder: swapWith.sortOrder }),
      patchGroup(swapWith.id, { sortOrder: current.sortOrder }),
    ]);
    if (okCurrent && okSwapWith) {
      setGroups((previous) => {
        const next = [...previous];
        next[index] = { ...swapWith, sortOrder: current.sortOrder };
        next[targetIndex] = { ...current, sortOrder: swapWith.sortOrder };
        return next;
      });
    }
  }

  async function handleDelete(target: HostHighlightGroup) {
    if (typeof window !== "undefined" && !window.confirm(t("deleteConfirm"))) return;
    setBusyGroupId(target.id);
    setGroupError(null);
    try {
      const response = await fetch(basePath, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: target.id }),
      });
      if (!response.ok) throw new Error(`delete ${response.status}`);
      setGroups((previous) => previous.filter((candidate) => candidate.id !== target.id));
    } catch {
      setGroupError(t("error"));
    } finally {
      setBusyGroupId(null);
    }
  }

  const isGenerating = generationStatus === "queued" || generationStatus === "processing";
  const generateLabel = isGenerating
    ? t("generating")
    : generationStatus === "failed"
      ? t("retry")
      : lastGeneratedMediaCount > 0
        ? t("regenerate")
        : t("generate");

  const statusText =
    generationStatus === "queued"
      ? t("statusQueued")
      : generationStatus === "processing"
        ? t("statusProcessing")
        : generationStatus === "failed"
          ? t("statusFailed")
          : lastGeneratedMediaCount > 0
            ? t("statusPublished", { count: lastGeneratedMediaCount })
            : t("statusIdle");

  return (
    <section className="mt-6 rounded-lg border border-[#cfc3d3] bg-white p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="mt-1 text-sm text-[#675d6a]">{t("description")}</p>

      <fieldset className="mt-4" disabled={busyMode}>
        <legend className="text-sm font-medium">{t("modeLegend")}</legend>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`highlight-mode-${eventId}`}
              value="automatic"
              checked={mode === "automatic"}
              onChange={() => void handleModeChange("automatic")}
            />
            {t("modeAutomatic")}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="radio"
              name={`highlight-mode-${eventId}`}
              value="host_defined"
              checked={mode === "host_defined"}
              onChange={() => void handleModeChange("host_defined")}
            />
            {t("modeHostDefined")}
          </label>
        </div>
      </fieldset>
      {modeError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {modeError}
        </p>
      )}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#675d6a]">{statusText}</p>
        <button
          type="button"
          onClick={() => void handleGenerate()}
          disabled={busyGenerate || isGenerating}
          className="min-h-11 rounded-md bg-[#6D456F] px-4 text-sm font-semibold text-white disabled:opacity-40"
        >
          {generateLabel}
        </button>
      </div>
      {generateError && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {generateError}
        </p>
      )}

      {mode === "host_defined" && (
        <div className="mt-6 border-t border-[#e5dde8] pt-4">
          <h3 className="text-sm font-semibold">{t("groupsTitle")}</h3>

          {groups.length === 0 ? (
            <p className="mt-3 text-sm text-[#675d6a]">{t("empty")}</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {groups.map((item, index) => (
                <li key={item.id} className="rounded-md border border-[#e5dde8] px-3 py-2 text-sm">
                  {editingGroupId === item.id ? (
                    <div className="flex flex-col gap-2">
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
                        {t("descriptionLabel")}
                        <textarea
                          value={editDescription}
                          onChange={(event) => setEditDescription(event.target.value)}
                          maxLength={MAX_DESCRIPTION_LENGTH}
                          className="rounded-md border border-[#cfc3d3] px-3 py-2"
                        />
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveRename(item)}
                          disabled={busyGroupId === item.id}
                          className="min-h-11 rounded-md bg-[#6D456F] px-3 text-sm font-semibold text-white disabled:opacity-40"
                        >
                          {t("save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingGroupId(null)}
                          className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm font-semibold"
                        >
                          {t("cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <span className="font-medium">{item.name}</span>{" "}
                        <span className="text-[#675d6a]">{t("photoCount", { count: item.mediaCount })}</span>
                        {item.description && <p className="text-[#675d6a]">{item.description}</p>}
                        {!item.isVisible && <p className="text-[#a15c2e]">{t("hiddenNote")}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          aria-label={t("moveUpFor", { name: item.name })}
                          onClick={() => void handleMove(index, -1)}
                          disabled={index === 0 || busyGroupId === item.id}
                          className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm disabled:opacity-40"
                        >
                          {t("moveUp")}
                        </button>
                        <button
                          type="button"
                          aria-label={t("moveDownFor", { name: item.name })}
                          onClick={() => void handleMove(index, 1)}
                          disabled={index === groups.length - 1 || busyGroupId === item.id}
                          className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm disabled:opacity-40"
                        >
                          {t("moveDown")}
                        </button>
                        <button
                          type="button"
                          aria-label={t("renameFor", { name: item.name })}
                          onClick={() => {
                            setEditingGroupId(item.id);
                            setEditName(item.name);
                            setEditDescription(item.description ?? "");
                          }}
                          disabled={busyGroupId === item.id}
                          className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm"
                        >
                          {t("rename")}
                        </button>
                        <button
                          type="button"
                          aria-label={item.isVisible ? t("hideFor", { name: item.name }) : t("showFor", { name: item.name })}
                          onClick={() => void handleToggleVisibility(item)}
                          disabled={busyGroupId === item.id}
                          className="min-h-11 rounded-md border border-[#cfc3d3] px-3 text-sm"
                        >
                          {item.isVisible ? t("hide") : t("show")}
                        </button>
                        <button
                          type="button"
                          aria-label={t("deleteFor", { name: item.name })}
                          onClick={() => void handleDelete(item)}
                          disabled={busyGroupId === item.id}
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
          {groupError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {groupError}
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
                maxLength={MAX_NAME_LENGTH}
                className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              {t("descriptionLabel")}
              <input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("descriptionPlaceholder")}
                maxLength={MAX_DESCRIPTION_LENGTH}
                className="min-h-11 rounded-md border border-[#cfc3d3] px-3 py-2"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleAddGroup()}
              disabled={busyAdd || !name.trim()}
              className="min-h-11 rounded-md bg-[#6D456F] px-4 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busyAdd ? t("adding") : t("add")}
            </button>
          </div>
          {formError && (
            <p role="alert" className="mt-2 text-sm text-red-700">
              {formError}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
