"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type LeadStatus = "new" | "contacted" | "archived";

interface RequestActionsProps {
  leadId: string;
  previewHref: string;
  status: LeadStatus;
  previewGroupId: string | null;
}

export function RequestActions({
  leadId,
  previewHref,
  status,
  previewGroupId,
}: RequestActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (next: "contacted" | "archived" | "new") => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/marketing-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, status: next }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <a
        href={previewHref}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
      >
        Create preview
      </a>

      {previewGroupId && (
        <a
          href={`/preview/compare/${previewGroupId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-amber-600 hover:underline"
        >
          View preview
        </a>
      )}

      <div className="flex items-center gap-2">
        {status !== "contacted" && (
          <button
            onClick={() => setStatus("contacted")}
            disabled={loading}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            Mark contacted
          </button>
        )}
        {status !== "archived" ? (
          <button
            onClick={() => setStatus("archived")}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50"
          >
            Archive
          </button>
        ) : (
          <button
            onClick={() => setStatus("new")}
            disabled={loading}
            className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50"
          >
            Unarchive
          </button>
        )}
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
