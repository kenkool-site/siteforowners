"use client";

import { useState } from "react";
import { getCategoryPalette } from "@/lib/category-palette";

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
      <div className="rounded-[1.75rem] border border-warm-cream1 bg-white p-4 text-sm">
        <div className="mb-2 text-xs font-bold text-warm-textMuted">
          Group your services so customers can browse them.
        </div>
        <button
          type="button"
          onClick={add}
          className="rounded-full bg-pop-pink px-4 py-2 text-sm font-black text-pop-cream transition hover:bg-pink-700"
        >
          + Add category
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-[1.75rem] border border-warm-cream1 bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-[0.18em] text-pop-pink">
          Categories
        </span>
        <button
          type="button"
          onClick={add}
          disabled={categories.length >= MAX_ENTRIES}
          className="rounded-full bg-pop-pink px-3 py-1.5 text-xs font-black text-pop-cream disabled:opacity-50"
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
          const pal = getCategoryPalette(name);
          return (
            <div
              key={`${name}-${i}`}
              className={
                "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-xs " +
                (isEditing ? "border-warm-cream1 bg-white" : pal.shell)
              }
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
                    className="w-32 rounded border border-warm-cream1 bg-white px-1 py-0.5 text-xs"
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
                    className={"font-bold hover:underline " + (isEditing ? "text-warm-deep" : pal.name)}
                  >
                    {name}
                  </button>
                  <span className={isEditing ? "text-warm-textMuted" : pal.count}>({count})</span>
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
          <div className="inline-flex items-center gap-1 rounded-full border border-warm-cream1 bg-warm-cream2 py-1 pl-3 pr-1 text-xs">
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
              className="w-32 rounded border border-warm-cream1 bg-white px-1 py-0.5 text-xs"
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
        <div className="flex items-center gap-2 rounded-[1.25rem] border border-orange-200 bg-orange-50 p-2 text-xs font-bold text-orange-950">
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
