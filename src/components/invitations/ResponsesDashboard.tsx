"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { EventEditorMode } from "./EventEditor";
import type {
  InvitationResponse,
  InvitationResponsesDashboard as InvitationResponsesDashboardData,
  InvitationResponseSort,
  InvitationResponseStatusFilter,
} from "@/lib/invitations/responses";

export type { InvitationResponsesDashboard } from "@/lib/invitations/responses";

type ResponseDraft = {
  primaryName: string;
  email: string;
  phone: string;
  attending: boolean;
  partySize: number;
  additionalGuestNames: string;
  dietaryOrAccessibilityNotes: string;
  message: string;
};

function draftFor(response: InvitationResponse): ResponseDraft {
  return {
    primaryName: response.primaryName,
    email: response.email ?? "",
    phone: response.phone ?? "",
    attending: response.attending,
    partySize: response.partySize,
    additionalGuestNames: response.additionalGuestNames.join("\n"),
    dietaryOrAccessibilityNotes: response.dietaryOrAccessibilityNotes ?? "",
    message: response.message ?? "",
  };
}

const controlClass = "min-h-11 rounded-md border border-[#cfc3d3] bg-white px-3 py-2 text-[16px] text-[#2B2231] outline-none focus:border-[#6D456F] focus:ring-2 focus:ring-[#6D456F]/20";

function isDashboardData(value: unknown): value is InvitationResponsesDashboardData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  const summary = row.summary;
  return Array.isArray(row.responses)
    && typeof row.filteredTotal === "number"
    && typeof row.page === "number"
    && typeof row.perPage === "number"
    && typeof row.notificationWarningCount === "number"
    && Array.isArray(row.warnings)
    && Array.isArray(row.failedNotifications)
    && Boolean(summary)
    && typeof summary === "object"
    && typeof (summary as Record<string, unknown>).attendingPeople === "number"
    && typeof (summary as Record<string, unknown>).attendingParties === "number"
    && typeof (summary as Record<string, unknown>).declinedParties === "number"
    && typeof (summary as Record<string, unknown>).totalSubmissions === "number";
}

export function ResponsesDashboard({
  eventId,
  mode,
  initialData,
}: {
  eventId: string;
  mode: EventEditorMode;
  initialData?: InvitationResponsesDashboardData;
}) {
  const t = useTranslations("invitations.editor.responsesDashboard");
  const locale = useLocale();
  const [data, setData] = useState<InvitationResponsesDashboardData | null>(initialData ?? null);
  const [status, setStatus] = useState<InvitationResponseStatusFilter>("all");
  const [sort, setSort] = useState<InvitationResponseSort>("newest");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(initialData?.page ?? 1);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<InvitationResponse | null>(null);
  const [draft, setDraft] = useState<ResponseDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const editHeadingRef = useRef<HTMLHeadingElement>(null);

  const query = useMemo(() => new URLSearchParams({
    status,
    sort,
    search: search.trim(),
    page: String(page),
    perPage: "25",
  }), [page, search, sort, status]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/responses?${query}`, { signal });
      const result: unknown = await response.json();
      if (!response.ok || !isDashboardData(result)) throw new Error("responses unavailable");
      setData(result);
      setPage((current) => current === result.page ? current : result.page);
    } catch (loadError) {
      if (!(loadError instanceof DOMException && loadError.name === "AbortError")) setError(t("loadError"));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [eventId, query, t]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  useEffect(() => {
    if (editing) editHeadingRef.current?.focus();
  }, [editing]);

  function beginEdit(response: InvitationResponse) {
    setEditing(response);
    setDraft(draftFor(response));
    setError("");
  }

  async function saveResponse() {
    if (!editing || !draft || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/responses`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          rsvpId: editing.id,
          response: {
            primaryName: draft.primaryName,
            email: draft.email,
            phone: draft.phone,
            attending: draft.attending,
            partySize: draft.attending ? draft.partySize : 0,
            additionalGuestNames: draft.attending
              ? draft.additionalGuestNames.split("\n").map((name) => name.trim()).filter(Boolean)
              : [],
            dietaryOrAccessibilityNotes: draft.dietaryOrAccessibilityNotes,
            message: draft.message,
          },
        }),
      });
      const result = await response.json() as { ok?: boolean; code?: string; errors?: Record<string, string> };
      if (!response.ok || !result.ok) {
        setError(result.code === "capacity_reached" ? t("edit.capacityError") : t("edit.saveError"));
        return;
      }
      setEditing(null);
      setDraft(null);
      await load();
    } catch {
      setError(t("edit.saveError"));
    } finally {
      setSaving(false);
    }
  }

  function submitResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void saveResponse();
  }

  async function retry(notificationId: string) {
    if (mode !== "founder" || retrying) return;
    setRetrying(notificationId);
    setError("");
    try {
      const response = await fetch(`/api/invitations/admin/notifications/${notificationId}/retry`, { method: "POST" });
      if (!response.ok) {
        setError(t("retryError"));
        return;
      }
      await load();
    } catch {
      setError(t("retryError"));
    } finally {
      setRetrying(null);
    }
  }

  async function removeResponse(responseToRemove: InvitationResponse) {
    if (mode !== "founder" || removing) return;
    if (!window.confirm(t("remove.confirm", { name: responseToRemove.primaryName }))) return;
    setRemoving(responseToRemove.id);
    setError("");
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/responses`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rsvpId: responseToRemove.id }),
      });
      const result = await response.json() as { ok?: boolean };
      if (!response.ok || !result.ok) {
        setError(t("remove.error"));
        return;
      }
      if (editing?.id === responseToRemove.id) {
        setEditing(null);
        setDraft(null);
      }
      await load();
    } catch {
      setError(t("remove.error"));
    } finally {
      setRemoving(null);
    }
  }

  const summaryItems = data ? [
    [data.summary.attendingPeople, t("summary.attendingPeople", { count: data.summary.attendingPeople })],
    [data.summary.attendingParties, t("summary.attendingParties", { count: data.summary.attendingParties })],
    [data.summary.declinedParties, t("summary.declinedParties", { count: data.summary.declinedParties })],
    [data.summary.remainingCapacity ?? "—", data.summary.remainingCapacity === null ? t("summary.noCapacity") : t("summary.remaining", { count: data.summary.remainingCapacity })],
    [data.summary.totalSubmissions, t("summary.total", { count: data.summary.totalSubmissions })],
    [data.notificationWarningCount, t("summary.deliveryWarnings", { count: data.notificationWarningCount })],
  ] as const : [];
  const totalPages = data ? Math.max(1, Math.ceil(data.filteredTotal / data.perPage)) : 1;
  const displayedPage = data?.page ?? page;

  return (
    <div
      data-response-ledger="true"
      className="border-y border-[#cfc3d3] bg-white"
      onChange={(event) => event.stopPropagation()}
      onInput={(event) => event.stopPropagation()}
    >
      {data && (
        <div className="grid grid-cols-2 divide-x divide-y divide-[#ddd4e1] border-b border-[#cfc3d3] sm:grid-cols-3 lg:grid-cols-6">
          {summaryItems.map(([value, label]) => (
            <div key={label} className="min-w-0 px-3 py-4 sm:px-4">
              <strong className="block font-[family-name:var(--font-fraunces)] text-3xl font-medium leading-none text-[#4A3150]">{value}</strong>
              <span className="mt-2 block text-xs leading-4 text-[#675d6a]">{label}</span>
            </div>
          ))}
        </div>
      )}

      {data && data.warnings.length > 0 && (
        <div className="divide-y divide-[#ead9cc] border-b border-[#d9b996] bg-[#fff9f2]" aria-label={t("warnings.label")}>
          {data.warnings.map((warning) => (
            <div key={warning.code} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="font-medium text-[#72452d]">{t(`warnings.${warning.code}`, { count: warning.count })}</p>
              {warning.code === "deadline_reached" || warning.code === "capacity_reached" ? <a href="#rsvp" className="font-semibold text-[#6D456F] underline underline-offset-4">{t("warnings.reviewSettings")}</a> : null}
              {warning.code === "email_limit_reached" || warning.code === "sms_limit_reached" ? <a href="#rsvp" className="font-semibold text-[#6D456F] underline underline-offset-4">{mode === "founder" ? t("warnings.adjustLimits") : t("warnings.reviewSettings")}</a> : null}
              {warning.code === "expired" || warning.code === "offline" ? <a href="#preview" className="font-semibold text-[#6D456F] underline underline-offset-4">{t("warnings.reviewAvailability")}</a> : null}
            </div>
          ))}
          {mode === "founder" && data.failedNotifications.map((notification) => (
            <div key={notification.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="text-[#72452d]">{t("failedChannel", { channel: t(`channels.${notification.channel}`) })}</span>
              <button type="button" disabled={retrying !== null} onClick={() => void retry(notification.id)} className="min-h-11 font-semibold text-[#6D456F] underline underline-offset-4 disabled:opacity-50">
                {retrying === notification.id ? t("retrying") : t("retry")}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-3 border-b border-[#ddd4e1] bg-[#F7F4F8] p-4 sm:grid-cols-[minmax(0,1fr)_10rem_10rem_auto] sm:items-end">
        <label className="text-sm font-semibold text-[#2B2231]">{t("filters.search")}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("filters.searchPlaceholder")} className={`mt-2 w-full ${controlClass}`} /></label>
        <label className="text-sm font-semibold text-[#2B2231]">{t("filters.status")}<select value={status} onChange={(event) => { setStatus(event.target.value as InvitationResponseStatusFilter); setPage(1); }} className={`mt-2 w-full ${controlClass}`}><option value="all">{t("filters.all")}</option><option value="attending">{t("filters.attending")}</option><option value="declined">{t("filters.declined")}</option></select></label>
        <label className="text-sm font-semibold text-[#2B2231]">{t("filters.sort")}<select value={sort} onChange={(event) => { setSort(event.target.value as InvitationResponseSort); setPage(1); }} className={`mt-2 w-full ${controlClass}`}><option value="newest">{t("filters.newest")}</option><option value="oldest">{t("filters.oldest")}</option><option value="name">{t("filters.name")}</option></select></label>
        <a href={`/api/invitations/events/${eventId}/responses.csv?${query}`} download className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#6D456F] px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F] focus-visible:ring-offset-2">{t("downloadCsv")}</a>
      </div>

      {error && <p role="alert" className="border-b border-[#e5bcbc] bg-red-50 px-4 py-3 text-sm text-[#7f2929]">{error}</p>}
      {loading && !data && <p className="px-4 py-8 text-sm text-[#675d6a]">{t("loading")}</p>}
      {data && data.responses.length === 0 && !loading && <p className="px-4 py-10 text-center text-sm text-[#675d6a]">{t("empty")}</p>}

      {data && data.responses.length > 0 && (
        <div className="grid gap-3 bg-[#F7F4F8] p-3 sm:p-4">
          {data.responses.map((response) => (
            <details key={response.id} className="group overflow-hidden rounded-lg border border-[#ddd4e1] bg-white">
              <summary className="flex cursor-pointer list-none flex-col gap-3 px-4 py-3 marker:content-none sm:px-5">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block truncate text-sm text-[#2B2231]">{response.primaryName}</strong>
                    <span data-response-contact className="mt-1 grid gap-0.5 text-xs leading-4 text-[#675d6a]">
                      {response.email && <span className="truncate">{response.email}</span>}
                      {response.phone && <span>{response.phone}</span>}
                    </span>
                  </span>
                  <span className={`w-fit shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${response.attending ? "bg-[#e6f2eb] text-[#285d44]" : "bg-[#f2e8e8] text-[#7f2929]"}`}>{response.attending ? t("status.attending") : t("status.declined")}</span>
                </span>
                <span className="flex items-center justify-between gap-3 border-t border-dashed border-[#e7e0e9] pt-3">
                  <span>
                    {response.attending && (
                      <span data-response-party-size className="w-fit rounded-full bg-[#F7F4F8] px-2.5 py-1 text-xs font-semibold text-[#6D456F]">{t("partySize", { count: response.partySize })}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-[#6D456F]">
                    <span className="group-open:hidden">{t("viewDetails")}</span>
                    <span className="hidden group-open:inline">{t("hideDetails")}</span>
                    <span aria-hidden="true" className="inline-block transition-transform group-open:rotate-180 motion-reduce:transition-none">⌄</span>
                  </span>
                </span>
              </summary>
              <div className="grid gap-4 border-t border-[#e7e0e9] px-4 py-5 text-sm sm:grid-cols-2 sm:px-5">
                <div><p className="font-semibold text-[#2B2231]">{t("contact")}</p><p className="mt-1 break-all text-[#675d6a]">{response.email || "—"}<br />{response.phone || "—"}</p></div>
                <div><p className="font-semibold text-[#2B2231]">{t("additionalGuests")}</p><p className="mt-1 whitespace-pre-line text-[#675d6a]">{response.additionalGuestNames.join("\n") || "—"}</p></div>
                <div><p className="font-semibold text-[#2B2231]">{t("notes")}</p><p className="mt-1 whitespace-pre-wrap text-[#675d6a]">{response.dietaryOrAccessibilityNotes || "—"}</p></div>
                <div><p className="font-semibold text-[#2B2231]">{t("message")}</p><p className="mt-1 whitespace-pre-wrap text-[#675d6a]">{response.message || "—"}</p></div>
                <p className="text-xs text-[#807484] sm:col-span-2">{t("received", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(response.createdAt)) })}</p>
                <div className="flex flex-wrap gap-3 sm:col-span-2">
                  <button type="button" onClick={() => beginEdit(response)} className="min-h-11 w-fit rounded-md border border-[#b9aabc] bg-white px-4 py-2 text-sm font-semibold text-[#55405a]">{t("edit.action")}</button>
                  {mode === "founder" && <button type="button" disabled={removing !== null} onClick={() => void removeResponse(response)} className="min-h-11 w-fit rounded-md border border-[#b75b5b] bg-white px-4 py-2 text-sm font-semibold text-[#8a2d2d] disabled:opacity-50">{removing === response.id ? t("remove.removing") : t("remove.action")}</button>}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}

      {data && totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 border-t border-[#ddd4e1] px-4 py-3 text-sm">
          <button type="button" disabled={displayedPage <= 1 || loading} onClick={() => setPage(Math.max(1, displayedPage - 1))} className="min-h-11 font-semibold text-[#6D456F] disabled:opacity-40">{t("previous")}</button>
          <span className="text-[#675d6a]">{t("page", { page: displayedPage, total: totalPages })}</span>
          <button type="button" disabled={displayedPage >= totalPages || loading} onClick={() => setPage(displayedPage + 1)} className="min-h-11 font-semibold text-[#6D456F] disabled:opacity-40">{t("next")}</button>
        </div>
      )}

      {editing && draft && (
        <form data-response-edit-form="true" onSubmit={submitResponse} className="border-t-2 border-[#6D456F] bg-[#F7F4F8] p-4 sm:p-6" aria-labelledby="response-edit-heading">
          <div className="flex items-start justify-between gap-4"><div><h3 ref={editHeadingRef} tabIndex={-1} id="response-edit-heading" className="text-lg font-semibold text-[#2B2231] outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F]">{t("edit.title")}</h3><p className="mt-1 text-sm text-[#675d6a]">{t("edit.help")}</p></div><button type="button" onClick={() => { setEditing(null); setDraft(null); }} className="min-h-11 text-sm font-semibold text-[#6D456F] underline underline-offset-4">{t("edit.cancel")}</button></div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">{t("edit.primaryName")}<input name="primaryName" required value={draft.primaryName} onChange={(event) => setDraft({ ...draft, primaryName: event.target.value })} className={`mt-2 w-full ${controlClass}`} /></label>
            <label className="text-sm font-semibold">{t("edit.email")}<input name="email" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} className={`mt-2 w-full ${controlClass}`} /></label>
            <label className="text-sm font-semibold">{t("edit.phone")}<input name="phone" type="tel" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} className={`mt-2 w-full ${controlClass}`} /></label>
            <fieldset><legend className="text-sm font-semibold">{t("edit.response")}</legend><div className="mt-3 flex gap-4"><label className="flex min-h-11 items-center gap-2 text-sm"><input name="attending" type="radio" checked={draft.attending} onChange={() => setDraft({ ...draft, attending: true, partySize: Math.max(1, draft.partySize) })} />{t("status.attending")}</label><label className="flex min-h-11 items-center gap-2 text-sm"><input name="attending" type="radio" checked={!draft.attending} onChange={() => setDraft({ ...draft, attending: false, partySize: 0 })} />{t("status.declined")}</label></div></fieldset>
            {draft.attending && <label className="text-sm font-semibold">{t("edit.partySize")}<input name="partySize" type="number" min="1" required value={draft.partySize} onChange={(event) => setDraft({ ...draft, partySize: Number(event.target.value) })} className={`mt-2 w-full ${controlClass}`} /></label>}
            {draft.attending && <label className="text-sm font-semibold">{t("edit.additionalGuests")}<textarea name="additionalGuestNames" rows={3} value={draft.additionalGuestNames} onChange={(event) => setDraft({ ...draft, additionalGuestNames: event.target.value })} className={`mt-2 w-full ${controlClass}`} /></label>}
            <label className="text-sm font-semibold sm:col-span-2">{t("edit.notes")}<textarea name="dietaryOrAccessibilityNotes" rows={3} value={draft.dietaryOrAccessibilityNotes} onChange={(event) => setDraft({ ...draft, dietaryOrAccessibilityNotes: event.target.value })} className={`mt-2 w-full ${controlClass}`} /></label>
            <label className="text-sm font-semibold sm:col-span-2">{t("edit.message")}<textarea name="message" rows={3} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} className={`mt-2 w-full ${controlClass}`} /></label>
          </div>
          <button type="submit" disabled={saving} className="mt-5 min-h-11 rounded-md bg-[#6D456F] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? t("edit.saving") : t("edit.save")}</button>
        </form>
      )}
    </div>
  );
}
