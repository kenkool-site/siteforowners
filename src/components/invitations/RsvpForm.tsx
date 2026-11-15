"use client";

import { FormEvent, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { readableTextColor } from "@/lib/invitations/design-recipe";
import { eventDisplayClass } from "./event-display";

type RsvpFormProps = {
  preview?: boolean;
  slug: string;
  allowCreate: boolean;
  showPublicRsvpCount: boolean;
  accent?: string;
  whenLabel?: string | null;
  googleCalendarUrl?: string | null;
  icsHref?: string | null;
  icsFilename?: string;
  memoriesHref?: string | null;
  brandingEnabled?: boolean;
  /** Design-preview only. Guests reach success through the real submit response. */
  initialSuccess?: { name: string; attending: boolean } | null;
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
    const params = new URLSearchParams(url.hash.replace(/^#/, ""));
    const rsvpId = params.get("rsvpId");
    const editToken = params.get("editToken");
    return rsvpId && editToken ? { rsvpId, editToken } : null;
  } catch {
    return null;
  }
}

export function RsvpForm({
  slug,
  allowCreate,
  showPublicRsvpCount,
  preview = false,
  accent = "#1A3D24",
  whenLabel = null,
  googleCalendarUrl = null,
  icsHref = null,
  icsFilename = "event.ics",
  memoriesHref = null,
  brandingEnabled = true,
  initialSuccess = null,
}: RsvpFormProps) {
  const t = useTranslations("invitations.public.rsvp");
  const tPublic = useTranslations("invitations.public");
  const [attending, setAttending] = useState(initialSuccess?.attending ?? true);
  const [editCredential, setEditCredential] = useState<EditCredential | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [result, setResult] = useState<RsvpApiResponse | null>(null);
  const [hasSubmitted, setHasSubmitted] = useState(Boolean(initialSuccess));
  const [savedGuest, setSavedGuest] = useState<{ name: string; attending: boolean } | null>(initialSuccess);

  useEffect(() => {
    if (preview) return;
    setEditCredential(credentialFromUrl(window.location.href));
  }, [preview]);

  const canShowForm = allowCreate || editCredential !== null;
  const buttonColor = readableTextColor(accent);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (preview) return;
    setSubmitting(true);
    setErrorCode(null);
    const form = new FormData(event.currentTarget);
    const primaryName = String(form.get("primaryName") ?? "");
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
          primaryName,
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
    setSavedGuest({ name: primaryName.trim(), attending });
    setResult(data);
  }

  if (!canShowForm && !savedGuest) {
    return (
      <div className="mt-4" data-rsvp-slug={slug} data-rsvp-panel="closed">
        <p className="text-base leading-7 text-[#5E6F61]">{t("closedBody")}</p>
        <p className="mt-3 text-sm leading-6 text-[#5E6F61]">{t("closedEditHint")}</p>
      </div>
    );
  }

  if (savedGuest && (result?.ok || initialSuccess)) {
    return (
      <div data-rsvp-slug={slug} data-rsvp-panel="success" className="mt-2 text-center">
        <div className="mx-auto grid size-[72px] place-items-center rounded-full text-white" style={{ backgroundColor: accent }}>
          <Check aria-hidden="true" className="size-7" strokeWidth={2.2} />
        </div>
        <h3 className={`${eventDisplayClass} mt-3 text-[2rem] font-medium leading-tight text-[#1A3D24]`}>{t("thankYou", { name: savedGuest.name || t("fields.primaryName") })}</h3>
        {result?.ok && <p className="sr-only">{t(result.outcome === "updated" ? "successUpdated" : result.outcome === "unchanged" ? "successUnchanged" : "successCreated")}</p>}
        <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5E6F61]">
          {savedGuest.attending
            ? (whenLabel ? t("savedAttendingWhen", { when: whenLabel }) : t("savedAttending"))
            : t("savedDeclined")}
        </p>
        {savedGuest.attending && (googleCalendarUrl || icsHref) && (
          <div className="mt-5 grid grid-cols-2 gap-2">
            {googleCalendarUrl && <a href={googleCalendarUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#1A3D24] px-3 text-sm font-medium text-[#1A3D24]">{tPublic("googleCalendar")}</a>}
            {icsHref && <a href={icsHref} download={icsFilename} className="inline-flex min-h-11 items-center justify-center rounded-full border border-[#1A3D24] px-3 text-sm font-medium text-[#1A3D24]">{tPublic("downloadCalendar")}</a>}
          </div>
        )}
        <p className="mt-5 text-xs leading-5 text-[#5E6F61]">{t("memoriesHint")}</p>
        {memoriesHref && (
          <a href={memoriesHref} className="mt-4 flex items-center gap-3 border border-[#E4DCCE] bg-[#FBF8F2] p-3 text-left">
            {brandingEnabled && <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#1A3D24] font-[family-name:var(--font-event-display)] text-base text-white">i</span>}
            <span>
              <span className="block text-sm font-medium text-[#14261A]">{t("memoriesCta")}</span>
              <span className="block text-xs text-[#5E6F61]">{t("memoriesNote")}</span>
            </span>
          </a>
        )}
        {showPublicRsvpCount && result?.summary && (
          <p className="mt-4 text-sm text-[#1A3D24]">{t("updatedCounts", { count: result.summary.attendingPeople })}</p>
        )}
        <button type="button" onClick={() => { setResult(null); setSavedGuest(null); }} className="mt-5 min-h-11 text-sm font-semibold text-[#1A3D24] underline underline-offset-4">
          {t("update")}
        </button>
      </div>
    );
  }

  return (
    <form className="mt-6" onSubmit={handleSubmit} data-rsvp-slug={slug} data-rsvp-panel="form">
      <fieldset disabled={preview} className="grid gap-5">
        {editCredential && <p className="border border-[#E4DCCE] bg-[#FBF8F2] px-4 py-3 text-sm leading-6">{t("editing")}</p>}
        <fieldset className="grid gap-2.5">
          <legend className="sr-only">{t("fields.attendance")}</legend>
          <label className={`flex min-h-[4.5rem] items-center gap-3 border px-4 py-3 ${attending ? "border-[#1A3D24] bg-[#FBF8F2] shadow-[0_0_0_3px_rgba(26,61,36,.1)]" : "border-[#E4DCCE] bg-[#FBF8F2]"}`}>
            <input type="radio" name="attending" value="yes" checked={attending} onChange={() => setAttending(true)} className="size-5 accent-[#1A3D24]" />
            <span>
              <span className="block text-base font-medium text-[#14261A]">{t("fields.attending")}</span>
              <span className="block text-[12.5px] text-[#5E6F61]">{t("attendsHint")}</span>
            </span>
          </label>
          <label className={`flex min-h-[4.5rem] items-center gap-3 border px-4 py-3 ${!attending ? "border-[#1A3D24] bg-[#FBF8F2] shadow-[0_0_0_3px_rgba(26,61,36,.1)]" : "border-[#E4DCCE] bg-[#FBF8F2]"}`}>
            <input type="radio" name="attending" value="no" checked={!attending} onChange={() => setAttending(false)} className="size-5 accent-[#1A3D24]" />
            <span>
              <span className="block text-base font-medium text-[#14261A]">{t("fields.declining")}</span>
              <span className="block text-[12.5px] text-[#5E6F61]">{t("declinesHint")}</span>
            </span>
          </label>
        </fieldset>

        <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
          {t("fields.primaryName")}
          <input name="primaryName" required autoComplete="name" className="min-h-12 rounded-none border border-[#1A3D24]/40 bg-white px-3 text-base font-medium text-[#14261A] outline-none focus-visible:ring-4 focus-visible:ring-[#1A3D24]/10" />
        </label>

        <div className="grid gap-5 sm:grid-cols-2" aria-describedby="rsvp-contact-help">
          <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
            {t("fields.phone")}
            <input name="phone" type="tel" autoComplete="tel" className="min-h-11 rounded-none border border-[#1A3D24]/30 bg-white px-3 text-base text-[#14261A] outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]" />
          </label>
          <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
            {t("fields.email")}
            <input name="email" type="email" autoComplete="email" className="min-h-11 rounded-none border border-[#1A3D24]/30 bg-white px-3 text-base text-[#14261A] outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]" />
          </label>
        </div>
        <p id="rsvp-contact-help" className="-mt-3 text-xs leading-5 text-[#5E6F61]">{t("fields.contactHelp")}</p>

        {attending && (
          <div className="grid gap-5">
            <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
              {t("fields.partySize")}
              <input name="partySize" type="number" min="1" step="1" defaultValue="1" required className="min-h-11 rounded-none border border-[#1A3D24]/30 bg-white px-3 text-base text-[#14261A] outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]" />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
              {t("fields.additionalNames")}
              <textarea name="additionalGuestNames" rows={3} className="rounded-none border border-[#1A3D24]/30 bg-white px-3 py-2 text-base text-[#14261A] outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]" />
              <span className="text-xs font-normal leading-5 text-[#5E6F61]">{t("fields.additionalNamesHelp")}</span>
            </label>
          </div>
        )}

        <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
          {t("fields.notes")}
          <textarea name="dietaryOrAccessibilityNotes" rows={3} className="rounded-none border border-[#1A3D24]/30 bg-white px-3 py-2 text-base text-[#14261A] outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]" />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-[#14261A]">
          {t("fields.message")}
          <textarea name="message" rows={3} className="rounded-none border border-[#1A3D24]/30 bg-white px-3 py-2 text-base text-[#14261A] outline-none focus-visible:ring-2 focus-visible:ring-[#1A3D24]" />
        </label>

        {errorCode && <p role="alert" className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{t(`errors.${errorCode}` as "errors.server_error")}</p>}
        <button disabled={submitting} style={{ backgroundColor: accent, color: buttonColor }} className="min-h-12 rounded-full px-6 py-3 font-medium shadow-sm outline-none transition-[transform,opacity] hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-current focus-visible:ring-offset-2 disabled:opacity-60 motion-reduce:transform-none motion-reduce:transition-none">
          {submitting ? t("submitting") : (hasSubmitted || editCredential) ? t("update") : t("sendReply")}
        </button>
      </fieldset>
    </form>
  );
}
