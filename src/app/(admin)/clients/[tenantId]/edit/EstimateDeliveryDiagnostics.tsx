"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstimateDeliveryChannel } from "@/lib/home-services/types";

type EstimateRequestRow = {
  id: string;
  created_at: string;
  service_needed: string;
  notification_state: "pending" | "sent" | "failed";
  provider_error: string | null;
  photo_count: number;
};

function sanitizeFailureSummary(error: string | null): string {
  if (!error) return "";
  return error
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function StateBadge({ state }: { state: EstimateRequestRow["notification_state"] }) {
  if (state === "sent") {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        Sent
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
        Failed
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Pending
    </span>
  );
}

export function NotificationSettingsSection({
  channel,
  destinationE164,
  smsFallbackE164,
  twilioWarning,
  onChange,
}: {
  channel: EstimateDeliveryChannel;
  destinationE164: string;
  smsFallbackE164: string;
  twilioWarning: string | null;
  onChange: (patch: {
    channel?: EstimateDeliveryChannel;
    destination_e164?: string;
    sms_fallback_e164?: string;
  }) => void;
}) {
  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Estimate notifications</h2>
      {twilioWarning && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {twilioWarning}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Channel</label>
          <select
            value={channel}
            onChange={(e) => onChange({ channel: e.target.value as EstimateDeliveryChannel })}
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          >
            <option value="sms">SMS</option>
            <option value="whatsapp">WhatsApp</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Destination (E.164)</label>
          <input
            type="text"
            value={destinationE164}
            onChange={(e) => onChange({ destination_e164: e.target.value })}
            placeholder="+15551234567"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
          />
        </div>
        {channel === "whatsapp" && (
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium text-gray-700">
              SMS fallback (E.164, optional)
            </label>
            <input
              type="text"
              value={smsFallbackE164}
              onChange={(e) => onChange({ sms_fallback_e164: e.target.value })}
              placeholder="+15551234567"
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
            />
          </div>
        )}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Estimate form submissions notify this destination. Requires server-side Twilio configuration.
      </p>
    </section>
  );
}

export function EstimateDeliveryDiagnostics({ tenantId }: { tenantId: string }) {
  const [requests, setRequests] = useState<EstimateRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [resendingId, setResendingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/estimate-requests/list?tenantId=${encodeURIComponent(tenantId)}`,
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Failed to load");
      }
      const body = await res.json();
      setRequests(Array.isArray(body.requests) ? body.requests : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const handleResend = async (requestId: string) => {
    setResendingId(requestId);
    setError("");
    try {
      const res = await fetch("/api/admin/estimate-requests/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, requestId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Resend failed");
      }
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setResendingId(null);
    }
  };

  return (
    <section className="rounded-xl border bg-white p-6">
      <h2 className="mb-4 text-lg font-semibold text-gray-900">Delivery diagnostics</h2>
      <p className="mb-4 text-sm text-gray-500">
        Recent estimate requests and notification delivery status (founder only).
      </p>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : requests.length === 0 ? (
        <p className="text-sm text-gray-500">No estimate requests yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {requests.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900">{row.service_needed}</p>
                <p className="text-xs text-gray-500">{formatTimestamp(row.created_at)}</p>
                {row.photo_count > 0 && (
                  <p className="text-xs text-gray-400">{row.photo_count} photo(s)</p>
                )}
                {row.notification_state === "failed" && row.provider_error && (
                  <p className="mt-1 text-xs text-red-700">
                    {sanitizeFailureSummary(row.provider_error)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StateBadge state={row.notification_state} />
                {row.notification_state === "failed" && (
                  <button
                    type="button"
                    onClick={() => void handleResend(row.id)}
                    disabled={resendingId === row.id}
                    className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {resendingId === row.id ? "Sending..." : "Resend"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
