"use client";

import { useEffect, useState } from "react";

type UpdateRequest = {
  id: string;
  category: string;
  description: string;
  attachment_url: string | null;
  status: "pending" | "in_progress" | "done";
  created_at: string;
};

const STATUS_PILL: Record<string, string> = {
  pending: "bg-pink-100 text-pink-700",
  in_progress: "bg-amber-100 text-amber-700",
  done: "bg-green-100 text-green-700",
};

export function FounderUpdatesPanel({ tenantId }: { tenantId: string }) {
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/updates/list?tenantId=${encodeURIComponent(tenantId)}`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setRequests(data.requests ?? []);
        }
      } catch {
        // ignore — empty list shows
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [tenantId]);

  async function setStatus(id: string, status: string) {
    const prev = requests;
    setRequests((list) => list.map((r) => (r.id === id ? { ...r, status: status as UpdateRequest["status"] } : r)));
    try {
      const res = await fetch(`/api/admin/updates/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) setRequests(prev);
    } catch {
      setRequests(prev);
    }
  }

  if (loading) return null;
  if (requests.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 mb-4">
      <div className="text-sm font-semibold text-amber-900 mb-2">
        📥 Update requests ({requests.filter((r) => r.status !== "done").length} open)
      </div>
      <div className="space-y-2">
        {requests.slice(0, 5).map((r) => (
          <div key={r.id} className="bg-white rounded p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs uppercase tracking-wider text-gray-500">
                  {r.category} · {new Date(r.created_at).toLocaleDateString()}
                </div>
                <div className="mt-1 whitespace-pre-wrap">{r.description}</div>
                {r.attachment_url && (
                  <a
                    href={r.attachment_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-pink-700 underline mt-1 inline-block"
                  >
                    View attachment ↗
                  </a>
                )}
              </div>
              <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap " + STATUS_PILL[r.status]}>
                {r.status.replace("_", " ").toUpperCase()}
              </span>
            </div>
            <div className="mt-2 flex gap-2">
              {r.status === "pending" && (
                <button onClick={() => setStatus(r.id, "in_progress")} className="text-xs text-amber-700 underline">
                  Start
                </button>
              )}
              {r.status !== "done" && (
                <button onClick={() => setStatus(r.id, "done")} className="text-xs text-green-700 underline">
                  Mark done
                </button>
              )}
              {r.status === "done" && (
                <button onClick={() => setStatus(r.id, "pending")} className="text-xs text-gray-500 underline">
                  Reopen
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
