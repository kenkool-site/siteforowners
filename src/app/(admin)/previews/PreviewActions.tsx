"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface PreviewActionsProps {
  slug: string;
  groupId: string | null;
}

export function PreviewActions({ slug, groupId }: PreviewActionsProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this preview? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: [slug] }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <a
        href={`/preview/${slug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
      >
        View
      </a>
      {groupId && (
        <a
          href={`/preview/compare/${groupId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg border px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
        >
          Compare
        </a>
      )}
      <button
        onClick={handleDelete}
        disabled={deleting}
        className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
      >
        {deleting ? "..." : "Delete"}
      </button>
    </div>
  );
}

interface BulkDeleteProps {
  selectedSlugs: string[];
  onDone: () => void;
}

export function BulkDeleteButton({ selectedSlugs, onDone }: BulkDeleteProps) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  if (selectedSlugs.length === 0) return null;

  const handleBulkDelete = async () => {
    if (!confirm(`Delete ${selectedSlugs.length} previews? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/delete-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs: selectedSlugs }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Failed to delete");
        return;
      }
      const data = await res.json();
      if (data.protected > 0) {
        alert(`Deleted ${data.deleted}. ${data.protected} protected (linked to clients).`);
      }
      onDone();
      router.refresh();
    } catch {
      alert("Failed to delete");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <button
      onClick={handleBulkDelete}
      disabled={deleting}
      className="rounded-full border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
    >
      {deleting ? "Deleting..." : `Delete ${selectedSlugs.length} selected`}
    </button>
  );
}
