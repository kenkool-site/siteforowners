"use client";

import { useEffect } from "react";
import {
  buildWizardPrefillUrl,
  instagramHref,
  externalHref,
  type MarketingLeadRow,
} from "@/lib/marketing-lead";
import { RequestActions } from "./RequestActions";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[100px_1fr] gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-gray-900">{children}</dd>
    </div>
  );
}

export function RequestDetailModal({
  lead,
  onClose,
}: {
  lead: MarketingLeadRow;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{lead.business_name}</h2>
            <p className="mt-1 text-sm text-gray-500">
              {lead.business_type}
              <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                {lead.source}
              </span>
              <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-700">
                {lead.status}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <Detail label="Email">
            <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline break-all">{lead.email}</a>
          </Detail>
          <Detail label="Phone">
            <a href={`tel:${lead.phone}`} className="text-blue-600 hover:underline">{lead.phone}</a>
          </Detail>
          {lead.business_address && <Detail label="Address">{lead.business_address}</Detail>}
          {lead.instagram_url && (
            <Detail label="Instagram">
              <a href={instagramHref(lead.instagram_url)} target="_blank" rel="noopener noreferrer" className="break-all text-amber-600 hover:underline">
                {lead.instagram_url}
              </a>
            </Detail>
          )}
          {lead.booking_url && (
            <Detail label="Booking">
              <a href={externalHref(lead.booking_url)} target="_blank" rel="noopener noreferrer" className="break-all text-amber-600 hover:underline">
                {lead.booking_url}
              </a>
            </Detail>
          )}
          {lead.notes && (
            <Detail label="Notes">
              <p className="whitespace-pre-wrap text-gray-700">{lead.notes}</p>
            </Detail>
          )}
          <Detail label="Received">
            {new Date(lead.created_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
          </Detail>
        </dl>

        <div className="mt-6 flex justify-end border-t pt-4">
          <RequestActions
            leadId={lead.id}
            previewHref={buildWizardPrefillUrl(lead)}
            status={lead.status}
            previewGroupId={lead.preview_group_id}
          />
        </div>
      </div>
    </div>
  );
}
