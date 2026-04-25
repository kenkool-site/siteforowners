"use client";

import { useState } from "react";

export type Lead = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string | null;
  source_page: string | null;
  is_read: boolean;
  created_at: string;
};

function formatRelative(iso: string, now = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const m = Math.round(seconds / 60);
  if (m < 60) return m + " min ago";
  const h = Math.round(m / 60);
  if (h < 24) return h + " hr ago";
  const d = Math.round(h / 24);
  if (d < 7) return d + " day" + (d === 1 ? "" : "s") + " ago";
  return new Date(iso).toLocaleDateString();
}

export function LeadRow({ lead }: { lead: Lead }) {
  const [isRead, setIsRead] = useState(lead.is_read);

  async function markRead() {
    if (isRead) return;
    setIsRead(true);
    try {
      const res = await fetch("/api/admin/leads/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: lead.id, isRead: true }),
      });
      if (!res.ok) setIsRead(false);
    } catch {
      setIsRead(false);
    }
  }

  return (
    <div
      className={
        "px-4 py-3 border-b border-gray-100 last:border-b-0 " +
        (isRead ? "opacity-60" : "")
      }
      onClick={markRead}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium flex items-center gap-2">
            <span>{lead.name}</span>
            {!isRead && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--admin-primary)] text-white">
                NEW
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            {lead.phone && (
              <a
                href={"tel:" + lead.phone}
                onClick={(e) => e.stopPropagation()}
                className="text-[color:var(--admin-primary)] underline"
              >
                {lead.phone}
              </a>
            )}
            {lead.email && (
              <a
                href={"mailto:" + lead.email}
                onClick={(e) => e.stopPropagation()}
                className="text-[color:var(--admin-primary)] underline"
              >
                {lead.email}
              </a>
            )}
            <span>{formatRelative(lead.created_at)}</span>
          </div>
          {lead.message && (
            <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{lead.message}</div>
          )}
          {lead.source_page && (
            <div className="text-[10px] text-gray-400 mt-1 uppercase tracking-wider">
              from {lead.source_page}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
