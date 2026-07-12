"use client";

import { useCallback, useEffect, useState } from "react";
import type { EstimateDeliveryChannel } from "@/lib/home-services/types";
import { canRetryChannel } from "@/lib/estimate-admin-diagnostics";

type EstimateRequestRow = {
  id: string;
  created_at: string;
  service_needed: string;
  notification_state: "pending" | "sent" | "failed";
  provider_error: string | null;
  notification_destination: string | null;
  text_notification_state: ChannelState;
  text_provider_message_id: string | null;
  text_provider_error: string | null;
  email_notification_state: ChannelState;
  email_notification_destination: string | null;
  email_provider_message_id: string | null;
  email_provider_error: string | null;
  photo_count: number;
};
type ChannelState = "not_configured" | "pending" | "sent" | "failed";
type RetryChannel = "text" | "email";

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

function StateBadge({ state }: { state: ChannelState }) {
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
  if (state === "pending") return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      Pending
    </span>
  );
  return <span className="text-xs text-gray-400">Not configured</span>;
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
  const [resendingKey, setResendingKey] = useState<string | null>(null);

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

  const handleResend = async (requestId: string, channel: RetryChannel) => {
    const key = `${requestId}:${channel}`;
    setResendingKey(key);
    setError("");
    try {
      const res = await fetch("/api/admin/estimate-requests/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, requestId, channel }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Resend failed");
      }
      await loadRequests();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resend failed");
    } finally {
      setResendingKey(null);
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
              </div>
              <div className="grid min-w-64 gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700">Text</span>
                  <StateBadge state={row.text_notification_state} />
                  {canRetryChannel({ state: row.text_notification_state, destination: row.notification_destination, providerId: row.text_provider_message_id, error: row.text_provider_error }) && (
                  <button
                    type="button"
                    onClick={() => void handleResend(row.id, "text")}
                    disabled={resendingKey === `${row.id}:text`}
                    className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50"
                  >
                    {resendingKey === `${row.id}:text` ? "Sending..." : "Retry"}
                  </button>
                  )}
                </div>
                {row.text_notification_state === "failed" && row.text_provider_error && (
                  <p className="text-xs text-red-700">{sanitizeFailureSummary(row.text_provider_error)}</p>
                )}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-gray-700">Email</span>
                  <StateBadge state={row.email_notification_state} />
                  {canRetryChannel({ state: row.email_notification_state, destination: row.email_notification_destination, providerId: row.email_provider_message_id, error: row.email_provider_error }) && (
                    <button type="button" onClick={() => void handleResend(row.id, "email")}
                      disabled={resendingKey === `${row.id}:email`}
                      className="rounded-lg border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 disabled:opacity-50">
                      {resendingKey === `${row.id}:email` ? "Sending..." : "Retry"}
                    </button>
                  )}
                </div>
                {row.email_notification_state === "failed" && row.email_provider_error && (
                  <p className="text-xs text-red-700">{sanitizeFailureSummary(row.email_provider_error)}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
