"use client";

import { useCallback, useState } from "react";
import {
  buildWizardPrefillUrl,
  instagramHref,
  externalHref,
  type MarketingLeadRow,
} from "@/lib/marketing-lead";
import { RequestActions } from "./RequestActions";
import { RequestDetailModal } from "./RequestDetailModal";

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

export function RequestsTable({ leads }: { leads: MarketingLeadRow[] }) {
  const [selected, setSelected] = useState<MarketingLeadRow | null>(null);
  const handleClose = useCallback(() => setSelected(null), []);

  return (
    <>
      {/* Desktop: table */}
      <div className="hidden overflow-hidden rounded-xl border bg-white md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              <th className="px-5 py-3">Business</th>
              <th className="px-5 py-3">Contact</th>
              <th className="hidden px-5 py-3 md:table-cell">Links</th>
              <th className="hidden px-5 py-3 lg:table-cell">Notes</th>
              <th className="px-5 py-3">When</th>
              <th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                onClick={() => setSelected(lead)}
                className="cursor-pointer hover:bg-gray-50"
              >
                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-gray-900">{lead.business_name}</p>
                  <p className="text-xs text-gray-400">
                    {lead.business_type}
                    <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      {lead.source}
                    </span>
                  </p>
                  {lead.business_address && (
                    <p className="mt-0.5 text-xs text-gray-400">{lead.business_address}</p>
                  )}
                </td>
                <td className="px-5 py-4">
                  <a href={`tel:${lead.phone}`} onClick={stop} className="block text-sm font-medium text-blue-600 hover:underline">
                    {lead.phone}
                  </a>
                  <a href={`mailto:${lead.email}`} onClick={stop} className="block text-xs text-gray-400 hover:underline">
                    {lead.email}
                  </a>
                </td>
                <td className="hidden px-5 py-4 md:table-cell">
                  <div className="flex flex-col gap-1">
                    {lead.instagram_url && (
                      <a href={instagramHref(lead.instagram_url)} onClick={stop} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:underline">
                        Instagram
                      </a>
                    )}
                    {lead.booking_url && (
                      <a href={externalHref(lead.booking_url)} onClick={stop} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:underline">
                        Booking
                      </a>
                    )}
                    {!lead.instagram_url && !lead.booking_url && (
                      <span className="text-xs text-gray-300">&mdash;</span>
                    )}
                  </div>
                </td>
                <td className="hidden max-w-xs truncate px-5 py-4 text-sm text-gray-500 lg:table-cell">
                  {lead.notes || "—"}
                </td>
                <td className="whitespace-nowrap px-5 py-4 text-xs text-gray-400">
                  {timeAgo(lead.created_at)}
                </td>
                <td className="px-5 py-4" onClick={stop}>
                  <RequestActions
                    leadId={lead.id}
                    previewHref={buildWizardPrefillUrl(lead)}
                    status={lead.status}
                    previewGroupId={lead.preview_group_id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {leads.map((lead) => (
          <div
            key={lead.id}
            onClick={() => setSelected(lead)}
            className="cursor-pointer rounded-xl border bg-white p-4 hover:bg-gray-50"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">{lead.business_name}</p>
                <p className="text-xs text-gray-400">
                  {lead.business_type}
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                    {lead.source}
                  </span>
                </p>
                {lead.business_address && (
                  <p className="mt-0.5 text-xs text-gray-400">{lead.business_address}</p>
                )}
              </div>
              <span className="shrink-0 text-xs text-gray-400">{timeAgo(lead.created_at)}</span>
            </div>
            <div className="mt-2 space-y-0.5">
              <a href={`tel:${lead.phone}`} onClick={stop} className="block text-sm font-medium text-blue-600 hover:underline">
                {lead.phone}
              </a>
              <a href={`mailto:${lead.email}`} onClick={stop} className="block truncate text-xs text-gray-400 hover:underline">
                {lead.email}
              </a>
              <div className="flex flex-wrap gap-x-3">
                {lead.instagram_url && (
                  <a href={instagramHref(lead.instagram_url)} onClick={stop} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:underline">
                    Instagram
                  </a>
                )}
                {lead.booking_url && (
                  <a href={externalHref(lead.booking_url)} onClick={stop} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-amber-600 hover:underline">
                    Booking
                  </a>
                )}
              </div>
              {lead.notes && <p className="text-xs text-gray-500">{lead.notes}</p>}
            </div>
            <div className="mt-3 border-t pt-3" onClick={stop}>
              <RequestActions
                leadId={lead.id}
                previewHref={buildWizardPrefillUrl(lead)}
                status={lead.status}
                previewGroupId={lead.preview_group_id}
              />
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <RequestDetailModal lead={selected} onClose={handleClose} />
      )}
    </>
  );
}
