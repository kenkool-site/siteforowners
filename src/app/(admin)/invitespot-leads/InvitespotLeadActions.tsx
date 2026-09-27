"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InvitespotLeadStatus } from "@/lib/invitespot-lead";

export function InvitespotLeadActions({ leadId, status }: { leadId: string; status: InvitespotLeadStatus }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setStatus = async (next: InvitespotLeadStatus) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/invitespot-leads", {
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
      <div className="flex items-center gap-2">
        {status !== "contacted" && (
          <button onClick={() => setStatus("contacted")} disabled={loading} className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50">
            Mark contacted
          </button>
        )}
        {status !== "archived" ? (
          <button onClick={() => setStatus("archived")} disabled={loading} className="text-xs text-gray-400 hover:text-red-500 disabled:opacity-50">
            Archive
          </button>
        ) : (
          <button onClick={() => setStatus("new")} disabled={loading} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-50">
            Unarchive
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
