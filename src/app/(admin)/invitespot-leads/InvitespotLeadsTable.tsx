"use client";

import type { InvitespotLeadRow } from "@/lib/invitespot-lead";
import { InvitespotLeadActions } from "./InvitespotLeadActions";

function timeAgo(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export function InvitespotLeadsTable({ leads }: { leads: InvitespotLeadRow[] }) {
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3">Name</th>
              <th className="px-5 py-3">Contact</th>
              <th className="px-5 py-3">Planning</th>
              <th className="px-5 py-3">When / guests</th>
              <th className="px-5 py-3">Referred by</th>
              <th className="px-5 py-3">When submitted</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-gray-50">
                <td className="px-5 py-4 text-sm font-semibold text-gray-900">{lead.name}</td>
                <td className="px-5 py-4">
                  {lead.email && <a href={`mailto:${lead.email}`} className="block text-sm font-medium text-blue-600 hover:underline">{lead.email}</a>}
                  {lead.phone && <a href={`tel:${lead.phone}`} className="block text-xs text-gray-400 hover:underline">{lead.phone}</a>}
                </td>
                <td className="px-5 py-4 text-sm text-gray-700">{lead.event_type}</td>
                <td className="px-5 py-4 text-sm text-gray-500">
                  {lead.rough_date || "—"}{lead.guest_count ? ` · ${lead.guest_count} guests` : ""}
                </td>
                <td className="px-5 py-4 text-sm text-gray-500">{lead.referral_slug || "—"}</td>
                <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">{timeAgo(lead.created_at)}</td>
                <td className="px-5 py-4" onClick={stop}>
                  <InvitespotLeadActions leadId={lead.id} status={lead.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {leads.map((lead) => (
          <div key={lead.id} className="rounded-xl border bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="truncate text-sm font-semibold text-gray-900">{lead.name}</p>
              <span className="shrink-0 text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
            </div>
            <div className="mt-2 space-y-0.5">
              {lead.email && <a href={`mailto:${lead.email}`} className="block text-sm font-medium text-blue-600 hover:underline">{lead.email}</a>}
              {lead.phone && <a href={`tel:${lead.phone}`} className="block text-xs text-gray-400 hover:underline">{lead.phone}</a>}
              <p className="text-xs text-gray-500">{lead.event_type} · {lead.rough_date || "no date yet"}{lead.guest_count ? ` · ${lead.guest_count} guests` : ""}</p>
              {lead.referral_slug && <p className="text-xs text-gray-400">Referred by {lead.referral_slug}</p>}
            </div>
            <div className="mt-3 border-t pt-3" onClick={stop}>
              <InvitespotLeadActions leadId={lead.id} status={lead.status} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
