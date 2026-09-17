"use client";

import { FormEvent, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { readableTextColor } from "@/lib/invitations/design-recipe";

type RsvpFormProps = {
  preview?: boolean;
  slug: string;
  allowCreate: boolean;
  showPublicRsvpCount: boolean;
  accent?: string;
};

type EditCredential = { rsvpId: string; editToken: string };

type RsvpApiResponse = {
  ok?: boolean;
  code?: string;
  outcome?: "created" | "updated" | "unchanged";
  summary?: {
    attendingPeople: number;
    declinedParties: number;
    remainingCapacity: number | null;
  };
};

function credentialFromUrl(value: string): EditCredential | null {
  try {
    const url = new URL(value, window.location.origin);
    // The server embeds the edit credential in the URL fragment (see editUrl()
    // in src/lib/invitations/rsvp.ts) so it never reaches server logs, proxies,
    // or Referer headers. URLSearchParams only parses "?..."; a leading "#"
    // must be stripped before it can read fragment params.
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    const rsvpId = params.get("rsvpId");
    const editToken = params.get("editToken");
    return rsvpId && editToken ? { rsvpId, editToken } : null;
  } catch {
    return null;
  }
}

export function RsvpForm({ slug, allowCreate, showPublicRsvpCount, preview = false, accent = "#6D456F" }: RsvpFormProps) {
  const t = useTranslations("invitations.public.rsvp");
  const [attending, setAttending] = useState(true);
  const [editCredential, setEditCredential] = useState<EditCredential | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<RsvpApiResponse | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (preview) return;
    setEditCredential(credentialFromUrl(window.location.href));
  }, [preview]);

  const canShowForm = allowCreate || editCredential !== null;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    setSubmitting(true);
    setErrorCode(null);
    const form = new FormData(event.currentTarget);
    const additionalGuestNames = String(form.get("additionalGuestNames") ?? "")
      .split(/\r?\n|,/)
      .map((name) => name.trim())
      .filter(Boolean);
    const response = await fetch("/api/invitations/rsvp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        slug,
        rsvpId: editCredential?.rsvpId,
        editToken: editCredential?.editToken,
        rsvp: {
          primaryName: form.get("primaryName"),
          attending,
          partySize: attending ? Number(form.get("partySize")) : 0,
          additionalGuestNames: attending ? additionalGuestNames : [],
          email: form.get("email"),
          phone: form.get("phone"),
          dietaryOrAccessibilityNotes: form.get("dietaryOrAccessibilityNotes"),
          message: form.get("message"),
        },
      }),
    });
    const data = await response.json().catch(() => ({})) as RsvpApiResponse;
    setSubmitting(false);
    if (!response.ok || !data.ok) {
      setErrorCode(data.code ?? "server_error");
      return;
    }
    setHasSubmitted(true);
    setResult(data);
  }

  if (!canShowForm) {
    return (
      <div className="mt-4" data-rsvp-slug={slug}>
        <p className="text-base leading-7 opacity-85">{t("closedBody")}</p>
        <p className="mt-3 text-sm leading-6 opacity-75">{t("closedEditHint")}</p>
      </div>
    );
  }

  return (
    <form className="mt-6" onSubmit={handleSubmit} onChange={() => { if (result?.ok) setResult(null); }} data-rsvp-slug={slug}>
      <fieldset disabled={preview} className="grid gap-5">
      {editCredential && <p className="border border-current/30 px-4 py-3 text-sm leading-6">{t("editing")}</p>}
      <label className="grid gap-2 text-sm font-semibold">
        {t("fields.primaryName")}
        <input name="primaryName" required autoComplete="name" className="min-h-11 rounded-md border border-current/30 bg-white px-3 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
      </label>

      <fieldset className="grid gap-3">
        <legend className="text-sm font-semibold">{t("fields.attendance")}</legend>
        <label className="flex min-h-11 items-center gap-3 rounded-md border border-current/30 px-3">
          <input type="radio" name="attending" value="yes" checked={attending} onChange={() => setAttending(true)} />
          <span>{t("fields.attending")}</span>
        </label>
        <label className="flex min-h-11 items-center gap-3 rounded-md border border-current/30 px-3">
          <input type="radio" name="attending" value="no" checked={!attending} onChange={() => setAttending(false)} />
          <span>{t("fields.declining")}</span>
        </label>
      </fieldset>

      {attending && (
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">
            {t("fields.partySize")}
            <input name="partySize" type="number" min="1" step="1" defaultValue="1" required className="min-h-11 rounded-md border border-current/30 bg-white px-3 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
          </label>
          <label className="grid gap-2 text-sm font-semibold sm:col-span-2">
            {t("fields.additionalNames")}
            <textarea name="additionalGuestNames" rows={3} className="rounded-md border border-current/30 bg-white px-3 py-2 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
            <span className="text-xs font-normal leading-5 opacity-75">{t("fields.additionalNamesHelp")}</span>
          </label>
        </div>
      )}

      <div className="grid gap-5 sm:grid-cols-2" aria-describedby="rsvp-contact-help">
        <label className="grid gap-2 text-sm font-semibold">
          {t("fields.email")}
          <input name="email" type="email" autoComplete="email" className="min-h-11 rounded-md border border-current/30 bg-white px-3 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
        </label>
        <label className="grid gap-2 text-sm font-semibold">
          {t("fields.phone")}
          <input name="phone" type="tel" autoComplete="tel" className="min-h-11 rounded-md border border-current/30 bg-white px-3 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
        </label>
      </div>
      <p id="rsvp-contact-help" className="-mt-3 text-xs leading-5 opacity-75">{t("fields.contactHelp")}</p>

      <label className="grid gap-2 text-sm font-semibold">
        {t("fields.notes")}
        <textarea name="dietaryOrAccessibilityNotes" rows={3} className="rounded-md border border-current/30 bg-white px-3 py-2 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
      </label>
      <label className="grid gap-2 text-sm font-semibold">
        {t("fields.message")}
        <textarea name="message" rows={3} className="rounded-md border border-current/30 bg-white px-3 py-2 text-base text-slate-950 outline-none focus-visible:ring-2 focus-visible:ring-current" />
      </label>

      {errorCode && <p role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{t(`errors.${errorCode}` as "errors.server_error")}</p>}
      {result?.ok && (
        <div role="status" className="border border-emerald-200 bg-emerald-50 px-4 py-4 text-emerald-950">
          <p className="font-semibold">{t(result.outcome === "updated" ? "successUpdated" : result.outcome === "unchanged" ? "successUnchanged" : "successCreated")}</p>
          {showPublicRsvpCount && result.summary && (
            <p className="mt-3 text-sm">{t("updatedCounts", { count: result.summary.attendingPeople })}</p>
          )}
        </div>
      )}
      <button disabled={submitting} style={{ backgroundColor: accent, color: readableTextColor(accent) }} className="min-h-11 rounded-full px-6 py-3 font-semibold shadow-sm outline-none transition-[transform,opacity] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 focus-visible:ring-offset-transparent disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none">
        {submitting ? t("submitting") : (hasSubmitted || editCredential) ? t("update") : t("submit")}
      </button>
      </fieldset>
    </form>
  );
}
