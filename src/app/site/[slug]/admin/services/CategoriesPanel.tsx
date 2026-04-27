"use client";

import { useState } from "react";

interface CategoriesPanelProps {
  categories: string[];
  /** Count of services per category, plus "Other" for uncategorized. */
  counts: Record<string, number>;
  onChange: (next: string[], rename?: { from: string; to: string }, remove?: string) => void;
}

const MAX_ENTRIES = 10;
const MAX_LENGTH = 60;

export function CategoriesPanel({ categories, counts, onChange }: CategoriesPanelProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDraft, setPendingDraft] = useState<string | null>(null);

  function commitRename(index: number) {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setError("Name cannot be empty");
      return;
    }
    if (trimmed.length > MAX_LENGTH) {
      setError(`Name must be ${MAX_LENGTH} characters or less`);
      return;
    }
    const lower = trimmed.toLowerCase();
    // For conflict check, only compare against committed categories
    const conflict = categories.some(
      (c, i) => i !== index && c.toLowerCase() === lower,
    );
    if (conflict) {
      setError("That name already exists");
      return;
    }

    // Pending draft slot — committing adds it to parent state for the first time
    if (index === categories.length) {
      onChange([...categories, trimmed]);
      setPendingDraft(null);
      setEditingIndex(null);
      setError(null);
      return;
    }

    const oldName = categories[index];
    if (oldName === trimmed) {
      setEditingIndex(null);
      setError(null);
      return;
    }
    const next = categories.map((c, i) => (i === index ? trimmed : c));
    onChange(next, { from: oldName, to: trimmed });
    setEditingIndex(null);
    setError(null);
  }

  function discardPendingDraft() {
    setPendingDraft(null);
    setEditingIndex(null);
    setError(null);
  }

  function add() {
    if (categories.length >= MAX_ENTRIES) {
      setError(`At most ${MAX_ENTRIES} categories`);
      return;
    }
    const placeholder = "New category";
    setPendingDraft(placeholder);
    setEditingIndex(categories.length);
    setDraftName(placeholder);
    setError(null);
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= categories.length) return;
    const next = [...categories];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function confirmRemove(name: string) {
    const remaining = categories.filter((c) => c !== name);
    onChange(remaining, undefined, name);
    setRemoveTarget(null);
  }

  if (categories.length === 0 && pendingDraft === null) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4 text-sm">
        <div className="text-xs text-gray-500 mb-2">
          Group your services so customers can browse them.
        </div>
        <button
          type="button"
          onClick={add}
          className="text-sm bg-[var(--admin-primary)] text-white font-medium px-3 py-1.5 rounded-lg"
        >
          + Add category
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">
          Categories
        </span>
        <button
          type="button"
          onClick={add}
          disabled={categories.length >= MAX_ENTRIES}
          className="text-xs bg-[var(--admin-primary)] text-white font-medium px-2 py-1 rounded disabled:opacity-50"
        >
          + Add
        </button>
      </div>

      {error && (
        <div className="text-xs text-red-600">{error}</div>
      )}

      <div className="flex flex-wrap gap-2">
        {categories.map((name, i) => {
          const isEditing = editingIndex === i;
          const count = counts[name] ?? 0;
          return (
            <div
              key={`${name}-${i}`}
              className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full pl-3 pr-1 py-1 text-xs"
            >
              {isEditing ? (
                <>
                  <input
                    autoFocus
                    type="text"
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitRename(i);
                      if (e.key === "Escape") {
                        setEditingIndex(null);
                        setError(null);
                      }
                    }}
                    maxLength={MAX_LENGTH}
                    className="bg-white border border-gray-300 rounded px-1 py-0.5 text-xs w-32"
                  />
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => commitRename(i)}
                    aria-label="Save"
                    className="text-green-700 hover:text-green-900 px-1 font-bold"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setEditingIndex(null);
                      setError(null);
                    }}
                    aria-label="Cancel"
                    className="text-gray-500 hover:text-red-600 px-1"
                  >
                    ×
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingIndex(i);
                      setDraftName(name);
                      setError(null);
                    }}
                    className="font-medium hover:underline"
                  >
                    {name}
                  </button>
                  <span className="text-gray-500">({count})</span>
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="text-gray-500 disabled:opacity-30 px-1">↑</button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === categories.length - 1} aria-label="Move down" className="text-gray-500 disabled:opacity-30 px-1">↓</button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(name)}
                    aria-label="Remove"
                    className="text-gray-500 hover:text-red-600 px-1"
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          );
        })}

        {/* Pending draft chip — explicit ✓ to commit, × to discard, Enter / Esc on keyboard. */}
        {pendingDraft !== null && (
          <div className="inline-flex items-center gap-1 bg-gray-100 border border-gray-200 rounded-full pl-3 pr-1 py-1 text-xs">
            <input
              autoFocus
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitRename(categories.length);
                }
                if (e.key === "Escape") discardPendingDraft();
              }}
              maxLength={MAX_LENGTH}
              className="bg-white border border-gray-300 rounded px-1 py-0.5 text-xs w-32"
            />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitRename(categories.length)}
              aria-label="Save"
              className="text-green-700 hover:text-green-900 px-1 font-bold"
            >
              ✓
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={discardPendingDraft}
              aria-label="Cancel"
              className="text-gray-500 hover:text-red-600 px-1"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {removeTarget && (
        <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs flex items-center gap-2">
          <span className="flex-1">
            Remove &quot;<strong>{removeTarget}</strong>&quot;?
            {(counts[removeTarget] ?? 0) > 0 && (
              <> {counts[removeTarget]} {counts[removeTarget] === 1 ? "service" : "services"} will become uncategorized.</>
            )}
          </span>
          <button type="button" onClick={() => confirmRemove(removeTarget)} className="text-red-600 font-medium underline">Confirm</button>
          <button type="button" onClick={() => setRemoveTarget(null)} className="text-gray-500 underline">Cancel</button>
        </div>
      )}
    </div>
  );
}
