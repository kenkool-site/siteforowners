"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { zonedWallTimeToUtcIso } from "@/lib/invitations/event-time";
import type {
  InvitationMediaItem,
  InvitationMediaKind,
  InvitationMediaSnapshot,
} from "@/lib/invitations/media";
import type { InvitationEventForManagement } from "@/lib/invitations/repository";
import type { InvitationEventStatus } from "@/lib/invitations/types";
import { ResponsesDashboard } from "./ResponsesDashboard";
import { ReferenceImportReview } from "./ReferenceImportReview";
import type { ExtractedFact, InvitationReferenceAnalysis } from "@/lib/invitations/reference-analysis";
import type { InvitationDesignRecipe } from "@/lib/invitations/design-recipe";
import type { InvitationWording } from "@/lib/invitations/wording";
import { invitationPublicUrl } from "@/lib/invitations/public-url";
import type { InvitationStyleGuide } from "@/lib/invitations/style-guide";

export type EditorEvent = InvitationEventForManagement;
export type EventEditorMode = "founder" | "owner";

type FieldErrors = Record<string, string>;
type StatusCommand = "publish" | "close" | "reopen" | "expire" | "offline" | "draft";

const SECTION_KEYS = ["event", "design", "rsvp", "preview", "responses"] as const;
const LOCALIZED_ERROR_KEYS = new Set([
  "eventType", "locale", "title", "honoreeNames", "timezone", "startsAt", "endsAt",
  "venueName", "address", "themeKey", "fontPairKey", "primaryColor", "accentColor",
  "publicSubdomain",
  "travelInfo",
  "capacity", "rsvpDeadline", "passcode", "removePasscode", "notificationEmail",
  "notificationPhone", "expireAt", "submissionLimit", "emailNotificationLimit",
  "smsNotificationLimit", "media", "command",
  "ownerName", "ownerEmail", "ownerEmailTaken", "ownerPhone", "newOwnerPin",
]);

const inputClass = "mt-2 min-h-11 w-full rounded-md border border-[#d8cedc] bg-white px-3 py-2 text-[16px] text-[#2B2231] outline-none transition focus:border-[#6D456F] focus:ring-2 focus:ring-[#6D456F]/20";
const labelClass = "block text-sm font-semibold text-[#2B2231]";
const sectionClass = "scroll-mt-24 border-b border-[#ddd4e1] py-7 first:pt-0 last:border-b-0";

type MediaMutationResponse = {
  event?: EditorEvent;
  media?: InvitationMediaSnapshot;
  errors?: { media?: string };
};

function emptyMedia(event: EditorEvent): InvitationMediaSnapshot {
  const item = (
    kind: Exclude<InvitationMediaKind, "gallery">,
    path: string | null,
  ): InvitationMediaItem | null => path ? { kind, path, url: "" } : null;
  return {
    designedInvite: item("designed_invite", event.designedInvitePath),
    cover: item("cover", event.coverImagePath),
    video: item("video", event.videoPath),
    gallery: [],
  };
}

async function postMedia(
  url: string,
  body: FormData,
  onProgress: (percent: number) => void,
): Promise<{ ok: boolean; result: MediaMutationResponse }> {
  const file = body.get("file") as File;
  const initiation = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "initiate", kind: body.get("kind"), name: file.name, type: file.type, size: file.size, altText: body.get("altText"), mediaId: body.get("mediaId") }),
  });
  const authorization = await initiation.json() as MediaMutationResponse & { ticket?: string; uploadUrl?: string };
  if (!initiation.ok || !authorization.ticket || !authorization.uploadUrl) return { ok: false, result: authorization };
  await new Promise<void>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("PUT", authorization.uploadUrl!);
    request.setRequestHeader("content-type", file.type);
    request.setRequestHeader("x-upsert", "false");
    request.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });
    request.addEventListener("error", () => reject(new Error("upload failed")));
    request.addEventListener("load", () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error("upload failed"));
    });
    request.send(file);
  });
  const finalization = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "finalize", ticket: authorization.ticket }),
  });
  return { ok: finalization.ok, result: await finalization.json() as MediaMutationResponse };
}

function toLocalInput(value: string | null, timeZone: string): string {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function numberOrNull(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || !value) return null;
  return Number(value);
}

function stringValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}

function statusCommands(status: InvitationEventStatus): StatusCommand[] {
  switch (status) {
    case "draft": return ["publish", "offline"];
    case "published": return ["close", "expire", "offline", "draft"];
    case "rsvp_closed": return ["reopen", "expire", "offline", "draft"];
    case "expired": return ["offline", "draft"];
    case "offline": return ["draft", "publish"];
  }
}

function SectionHeading({ title, help }: { title: string; help: string }) {
  return (
    <div className="mb-5">
      <h2 className="text-xl font-semibold tracking-[-0.02em] text-[#2B2231]">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-6 text-[#675d6a]">{help}</p>
    </div>
  );
}

function FieldError({ name, errors }: { name: string; errors: FieldErrors }) {
  return errors[name] ? <p className="mt-1.5 text-sm text-[#A33A3A]">{errors[name]}</p> : null;
}

export function EventEditor({
  event,
  mode,
  media: initialMedia,
}: {
  event: EditorEvent;
  mode: EventEditorMode;
  media?: InvitationMediaSnapshot;
}) {
  const t = useTranslations("invitations.editor");
  const locale = useLocale();
  const [currentEvent, setCurrentEvent] = useState(event);
  const [formVersion, setFormVersion] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState(event.status);
  const [statusBusy, setStatusBusy] = useState(false);
  const [credentialDirty, setCredentialDirty] = useState(false);
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [credentialSaved, setCredentialSaved] = useState(false);
  const [credentialErrors, setCredentialErrors] = useState<FieldErrors>({});
  const [previewTitle, setPreviewTitle] = useState(event.title);
  const [previewDescription, setPreviewDescription] = useState(event.description);
  const [previewTheme, setPreviewTheme] = useState(event.themeKey);
  const [previewPrimary, setPreviewPrimary] = useState(event.primaryColor);
  const [previewAccent, setPreviewAccent] = useState(event.accentColor);
  const initialFont = event.fontPairKey === "geist-geist" ? "geist-geist" : "fraunces-geist";
  const [previewFont, setPreviewFont] = useState(initialFont);
  const [media, setMedia] = useState<InvitationMediaSnapshot>(initialMedia ?? emptyMedia(event));
  const [mediaBusy, setMediaBusy] = useState<string | null>(null);
  const [mediaProgress, setMediaProgress] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [galleryAltText, setGalleryAltText] = useState("");
  const [analysis, setAnalysis] = useState<InvitationReferenceAnalysis | null>(event.referenceAnalysis);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [designRecipe, setDesignRecipe] = useState<InvitationDesignRecipe | null>(event.designRecipe);
  const [styleGuide, setStyleGuide] = useState<InvitationStyleGuide | null>(event.styleGuide ?? null);
  const [wordingSuggestion, setWordingSuggestion] = useState<InvitationWording | null>(null);
  const [wordingBusy, setWordingBusy] = useState(false);
  const [wordingError, setWordingError] = useState("");
  const [subdomainFeedback, setSubdomainFeedback] = useState("");
  const eventFormRef = useRef<HTMLFormElement>(null);

  const dateLabel = useMemo(() => currentEvent.startsAt
    ? new Intl.DateTimeFormat(locale, {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: currentEvent.timezone,
      }).format(new Date(currentEvent.startsAt))
    : t("previewDatePending"), [currentEvent.startsAt, currentEvent.timezone, locale, t]);

  function markDirty() {
    setDirty(true);
    setSaved(false);
  }

  function markCredentialDirty() {
    setCredentialDirty(true);
    setCredentialSaved(false);
  }

  function localizeErrors(serverErrors: FieldErrors | undefined, fallback: "save" | "status"): FieldErrors {
    if (!serverErrors) return { [fallback === "save" ? "form" : "status"]: fallback === "save" ? t("saveError") : t("statusError") };
    return Object.fromEntries(Object.keys(serverErrors).map((key) => {
      if (key === "capacity" && serverErrors[key] === "below_attendance") return [key, t("errors.capacityBelowAttendance")];
      if (key === "form") return [key, t("saveError")];
      if (key === "status") return [key, t("statusError")];
      return [key, LOCALIZED_ERROR_KEYS.has(key) ? t(`errors.${key}`) : fallback === "save" ? t("saveError") : t("statusError")];
    }));
  }

  function localizeCredentialErrors(serverErrors: FieldErrors | undefined): FieldErrors {
    if (!serverErrors) return { form: t("credentialSaveError") };
    return Object.fromEntries(Object.keys(serverErrors).map((key) => {
      if (key === "form") return [key, t("credentialSaveError")];
      return [key, LOCALIZED_ERROR_KEYS.has(key) ? t(`errors.${key}`) : t("credentialSaveError")];
    }));
  }

  async function save(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    const form = eventSubmit.currentTarget;
    const data = new FormData(form);
    const timezone = stringValue(data, "timezone");
    const wallTime = (key: string): string | null => {
      const raw = stringValue(data, key);
      return raw ? zonedWallTimeToUtcIso(raw, timezone) : null;
    };

    let payload: Record<string, unknown>;
    try {
      const recommendedHotel = Number(stringValue(data, "recommendedHotel"));
      payload = {
        eventType: stringValue(data, "eventType"),
        locale: stringValue(data, "locale"),
        title: stringValue(data, "title"),
        honoreeNames: stringValue(data, "honoreeNames"),
        description: stringValue(data, "description"),
        timezone,
        startsAt: wallTime("startsAt"),
        endsAt: wallTime("endsAt"),
        venueName: stringValue(data, "venueName"),
        address: stringValue(data, "address"),
        mapUrl: stringValue(data, "mapUrl"),
        travelInfo: {
          airports: Array.from({ length: 3 }, (_, index) => ({
            name: stringValue(data, `airportName${index}`),
            note: stringValue(data, `airportNote${index}`),
            directionsUrl: stringValue(data, `airportDirectionsUrl${index}`),
          })),
          hotels: Array.from({ length: 5 }, (_, index) => ({
            name: stringValue(data, `hotelName${index}`),
            address: stringValue(data, `hotelAddress${index}`),
            recommended: recommendedHotel === index,
          })),
        },
        styleGuide,
        themeKey: stringValue(data, "themeKey"),
        fontPairKey: stringValue(data, "fontPairKey"),
        primaryColor: stringValue(data, "primaryColor"),
        accentColor: stringValue(data, "accentColor"),
        designRecipe,
        capacity: numberOrNull(data.get("capacity")),
        rsvpDeadline: wallTime("rsvpDeadline"),
        passcode: stringValue(data, "passcode") || undefined,
        removePasscode: data.has("removePasscode"),
        showPublicRsvpCount: data.has("showPublicRsvpCount"),
        ownerEmailNotifications: data.has("ownerEmailNotifications"),
        notificationEmail: stringValue(data, "notificationEmail"),
        ownerSmsNotifications: data.has("ownerSmsNotifications"),
        notificationPhone: stringValue(data, "notificationPhone"),
        guestEmailConfirmations: data.has("guestEmailConfirmations"),
        expireAt: wallTime("expireAt"),
      };
      if (mode === "founder") {
        payload.publicSubdomain = stringValue(data, "publicSubdomain");
        payload.submissionLimit = numberOrNull(data.get("submissionLimit"));
        payload.emailNotificationLimit = numberOrNull(data.get("emailNotificationLimit"));
        payload.smsNotificationLimit = numberOrNull(data.get("smsNotificationLimit"));
      }
    } catch {
      setErrors({ startsAt: t("errors.startsAt") });
      return;
    }

    setSaving(true);
    setErrors({});
    try {
      const response = await fetch(`/api/invitations/events/${currentEvent.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { event?: EditorEvent; errors?: FieldErrors };
      if (!response.ok || !result.event) {
        setErrors(localizeErrors(result.errors, "save"));
        return;
      }
      setCurrentEvent(result.event);
      setFormVersion((version) => version + 1);
      setStatus(result.event.status);
      setPreviewTitle(result.event.title);
      setPreviewDescription(result.event.description);
      setPreviewTheme(result.event.themeKey);
      setPreviewPrimary(result.event.primaryColor);
      setPreviewAccent(result.event.accentColor);
      setPreviewFont(result.event.fontPairKey === "geist-geist" ? "geist-geist" : "fraunces-geist");
      setDesignRecipe(result.event.designRecipe);
      setStyleGuide(result.event.styleGuide ?? null);
      setAnalysis(result.event.referenceAnalysis);
      setDirty(false);
      setSaved(true);
    } catch {
      setErrors({ form: t("saveError") });
    } finally {
      setSaving(false);
    }
  }

  async function checkPublicSubdomain(value: string) {
    if (!value.trim()) {
      setSubdomainFeedback("");
      return;
    }
    setSubdomainFeedback(t("publicDomainChecking"));
    try {
      const query = new URLSearchParams({ value, eventId: currentEvent.id });
      const response = await fetch(`/api/invitations/admin/subdomains/availability?${query}`);
      const result = await response.json() as { available?: boolean; suggestion?: string };
      if (!response.ok) setSubdomainFeedback(t("publicDomainCheckFailed"));
      else if (result.available) setSubdomainFeedback(t("publicDomainAvailable"));
      else setSubdomainFeedback(t("publicDomainUnavailable", { suggestion: result.suggestion ?? "" }));
    } catch {
      setSubdomainFeedback(t("publicDomainCheckFailed"));
    }
  }

  async function analyzeReference() {
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const response = await fetch(`/api/invitations/events/${currentEvent.id}/analyze-reference`, { method: "POST" });
      const result = await response.json() as { analysis?: InvitationReferenceAnalysis; error?: string };
      if (!response.ok || !result.analysis) {
        const code = result.error === "reference_required" || result.error === "analysis_rate_limited" ? result.error : "analysis_unavailable";
        setAnalysisError(t(`reference.errors.${code}`));
        return;
      }
      setAnalysis(result.analysis);
    } catch { setAnalysisError(t("reference.errors.analysis_unavailable")); }
    finally { setAnalyzing(false); }
  }

  function applyReference({ facts, eventColors, includeDesign }: { facts: ExtractedFact[]; eventColors: InvitationStyleGuide["colors"]; includeDesign: boolean }) {
    const form = eventFormRef.current;
    if (!form) return;
    for (const fact of facts) {
      if (fact.key === "styleNote") continue;
      const field = form.elements.namedItem(fact.key);
      if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) continue;
      field.value = fact.key === "startsAt" ? toLocalInput(fact.value, currentEvent.timezone) : fact.value;
      if (fact.key === "title") setPreviewTitle(fact.value);
      if (fact.key === "description") setPreviewDescription(fact.value);
    }
    const styleNote = facts.find((fact) => fact.key === "styleNote")?.value;
    if (styleNote || eventColors.length > 0) {
      setStyleGuide({
        note: styleNote ?? styleGuide?.note ?? null,
        colors: eventColors.length > 0 ? eventColors : styleGuide?.colors ?? [],
      });
    }
    if (includeDesign && analysis) {
      setDesignRecipe(analysis.recipe);
      setPreviewPrimary(analysis.recipe.palette.text);
      setPreviewAccent(analysis.recipe.palette.accent);
    }
    markDirty();
  }

  async function suggestWording() {
    setWordingBusy(true);
    setWordingError("");
    try {
      const response = await fetch(`/api/invitations/events/${currentEvent.id}/suggest-wording`, { method: "POST" });
      const result = await response.json() as { wording?: InvitationWording; error?: string };
      if (!response.ok || !result.wording) {
        setWordingError(t(result.error === "wording_rate_limited" ? "wording.errors.rateLimited" : "wording.errors.unavailable"));
        return;
      }
      setWordingSuggestion(result.wording);
    } catch { setWordingError(t("wording.errors.unavailable")); }
    finally { setWordingBusy(false); }
  }

  function applySuggestedDescription() {
    if (!wordingSuggestion || !eventFormRef.current) return;
    const description = eventFormRef.current.elements.namedItem("description");
    if (!(description instanceof HTMLTextAreaElement)) return;
    description.value = wordingSuggestion.description;
    setPreviewDescription(wordingSuggestion.description);
    markDirty();
  }

  async function changeStatus(command: StatusCommand) {
    if (dirty || saving) {
      setErrors({ status: t("saveBeforeStatus") });
      return;
    }
    setStatusBusy(true);
    setErrors({});
    try {
      const response = await fetch(`/api/invitations/events/${currentEvent.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command }),
      });
      const result = await response.json() as { status?: InvitationEventStatus; errors?: FieldErrors };
      if (!response.ok || !result.status) {
        setErrors(localizeErrors(result.errors, "status"));
        return;
      }
      setStatus(result.status);
    } catch {
      setErrors({ status: t("statusError") });
    } finally {
      setStatusBusy(false);
    }
  }

  async function saveCredentials(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!credentialDirty || credentialSaving) return;
    const form = eventSubmit.currentTarget;
    const data = new FormData(form);
    const payload = {
      ownerName: stringValue(data, "ownerName"),
      ownerEmail: stringValue(data, "ownerEmail"),
      ownerPhone: stringValue(data, "ownerPhone"),
      newOwnerPin: stringValue(data, "newOwnerPin") || undefined,
    };
    setCredentialSaving(true);
    setCredentialSaved(false);
    setCredentialErrors({});
    try {
      const response = await fetch(`/api/invitations/events/${currentEvent.id}/credentials`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { event?: EditorEvent; errors?: FieldErrors };
      if (!response.ok || !result.event) {
        setCredentialErrors(localizeCredentialErrors(result.errors));
        return;
      }
      const pin = form.elements.namedItem("newOwnerPin");
      if (pin instanceof HTMLInputElement) pin.value = "";
      setCurrentEvent(result.event);
      setCredentialDirty(false);
      setCredentialSaved(true);
    } catch {
      setCredentialErrors({ form: t("credentialSaveError") });
    } finally {
      setCredentialSaving(false);
    }
  }

  function mediaErrorCopy(code?: string): string {
    switch (code) {
      case "invalid_media_type": return t("media.errors.invalidType");
      case "file_too_large": return t("media.errors.tooLarge");
      case "video_too_long": return t("media.errors.videoTooLong");
      case "video_duration_unreadable": return t("media.errors.videoUnreadable");
      case "gallery_alt_required": return t("media.errors.altRequired");
      case "gallery_full": return t("media.errors.galleryFull");
      default: return t("media.errors.uploadFailed");
    }
  }

  async function uploadMedia(
    kind: InvitationMediaKind,
    file: File,
    galleryReplacement?: InvitationMediaItem,
  ): Promise<void> {
    const altText = galleryReplacement?.altText?.trim() || galleryAltText.trim();
    const body = new FormData();
    body.set("kind", kind);
    body.set("file", file);
    if (kind === "gallery") body.set("altText", altText);
    if (galleryReplacement?.id) body.set("mediaId", galleryReplacement.id);
    setMediaBusy(kind);
    setMediaProgress(0);
    setMediaError("");
    try {
      const { ok, result } = await postMedia(
        `/api/invitations/events/${currentEvent.id}/media`,
        body,
        setMediaProgress,
      );
      if (!ok || !result.event || !result.media) {
        setMediaError(mediaErrorCopy(result.errors?.media));
        return;
      }
      setCurrentEvent(result.event);
      setMedia(result.media);
      if (kind === "gallery") setGalleryAltText("");
    } catch {
      setMediaError(t("media.errors.uploadFailed"));
    } finally {
      setMediaBusy(null);
      setMediaProgress(null);
    }
  }

  async function removeMedia(item: InvitationMediaItem): Promise<void> {
    setMediaBusy(item.id ?? item.kind);
    setMediaError("");
    try {
      const response = await fetch(`/api/invitations/events/${currentEvent.id}/media`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: item.kind, id: item.id, path: item.path }),
      });
      const result = await response.json() as MediaMutationResponse;
      if (!response.ok || !result.event || !result.media) {
        setMediaError(t("media.errors.removeFailed"));
        return;
      }
      setCurrentEvent(result.event);
      setMedia(result.media);
    } catch {
      setMediaError(t("media.errors.removeFailed"));
    } finally {
      setMediaBusy(null);
    }
  }

  function mediaPreview(item: InvitationMediaItem, imageAlt: string) {
    if (!item.url) {
      return <p className="break-all text-xs text-[#675d6a]">{item.path.split("/").pop()}</p>;
    }
    if (item.kind === "video") {
      return <video src={item.url} controls preload="metadata" className="h-28 w-full max-w-48 rounded-md bg-[#2B2231] object-cover" />;
    }
    return <img src={item.url} alt={imageAlt} className="h-28 w-full max-w-48 rounded-md border border-[#ddd4e1] object-cover" />;
  }

  function singletonMediaRow(
    kind: Exclude<InvitationMediaKind, "gallery">,
    title: string,
    help: string,
    item: InvitationMediaItem | null,
  ) {
    const accept = kind === "video" ? "video/mp4,video/webm" : "image/jpeg,image/png,image/webp";
    const inputId = `invitation-media-${kind}`;
    return (
      <div className="grid gap-4 border-t border-[#ddd4e1] py-5 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
        <div>
          <h3 className="text-sm font-semibold text-[#2B2231]">{title}</h3>
          <p className="mt-1 text-xs leading-5 text-[#675d6a]">{help}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label htmlFor={inputId} className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-[#b9aabc] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] focus-within:ring-2 focus-within:ring-[#6D456F] focus-within:ring-offset-2">
              {item ? t("media.replace") : t("media.choose")}
              <input
                id={inputId}
                type="file"
                accept={accept}
                disabled={mediaBusy !== null}
                className="sr-only"
                onChange={(eventChange) => {
                  eventChange.stopPropagation();
                  const file = eventChange.currentTarget.files?.[0];
                  if (file) void uploadMedia(kind, file);
                  eventChange.currentTarget.value = "";
                }}
              />
            </label>
            {item && <button type="button" disabled={mediaBusy !== null} onClick={() => void removeMedia(item)} className="min-h-11 px-2 text-sm font-semibold text-[#7f2929] underline underline-offset-4 disabled:opacity-50">{t("media.remove")}</button>}
          </div>
        </div>
        <div className="min-h-20">{item ? mediaPreview(item, title) : <p className="text-sm text-[#807484]">{t("media.empty")}</p>}</div>
      </div>
    );
  }

  const previewBackground = previewTheme === "celebration" ? previewPrimary : "#FBFAFC";
  const previewText = previewTheme === "celebration" ? "#FBFAFC" : previewPrimary;

  return (
    <div className="min-h-screen bg-[#FBFAFC] pb-28 text-[#2B2231] lg:pb-10">
      <header className="border-b border-[#ddd4e1] bg-white/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="truncate text-sm text-[#675d6a]">{t("ownerContext", { name: currentEvent.owner.name })}</p>
            <h1 className="truncate text-xl font-semibold tracking-[-0.02em] sm:text-2xl">{previewTitle || t("placeholders.title")}</h1>
          </div>
          <div className="shrink-0 border-l border-[#ddd4e1] pl-4 text-right">
            <span className="block text-xs text-[#675d6a]">{t("status.label")}</span>
            <span className="text-sm font-semibold text-[#6D456F]">{t(`status.${status}`)}</span>
          </div>
        </div>
      </header>

      <div className="sticky top-0 z-20 overflow-x-auto border-b border-[#ddd4e1] bg-[#F1EDF4] lg:hidden">
        <nav className="flex min-w-max px-3" aria-label={t("sectionNavigation")}>
          {SECTION_KEYS.map((key) => (
            <a key={key} href={`#${key}`} className="min-h-12 px-3 py-3 text-sm font-semibold text-[#55485a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#6D456F]">
              {t(`sections.${key}`)}
            </a>
          ))}
        </nav>
      </div>

      <form ref={eventFormRef} key={`${currentEvent.id}:${formVersion}`} data-event-form="true" onSubmit={save} onChange={markDirty} className="mx-auto grid max-w-[1380px] lg:grid-cols-[180px_minmax(0,680px)_minmax(280px,1fr)] lg:gap-10 lg:px-8">
        <fieldset disabled={saving} className="contents border-0 p-0">
        <aside className="hidden py-8 lg:block">
          <nav className="sticky top-6 border-l border-[#cfc3d3]" aria-label={t("sectionNavigation")}>
            {SECTION_KEYS.map((key) => (
              <a key={key} href={`#${key}`} className="block border-l-2 border-transparent px-4 py-2.5 text-sm font-medium text-[#675d6a] hover:border-[#6D456F] hover:text-[#2B2231] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F]">
                {t(`sections.${key}`)}
              </a>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 px-4 py-7 sm:px-6 lg:px-0 lg:py-8">
          {errors.form && <div role="alert" className="mb-5 border-l-4 border-[#A33A3A] bg-red-50 px-4 py-3 text-sm text-[#7f2929]">{errors.form}</div>}

          <section id="event" className={sectionClass}>
            <SectionHeading title={t("sections.event")} help={t("sectionHelp.event")} />
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>{t("fields.eventType")}<input name="eventType" defaultValue={currentEvent.eventType} placeholder={t("placeholders.eventType")} className={inputClass} /></label>
              <label className={labelClass}>{t("fields.locale")}<select name="locale" defaultValue={currentEvent.locale} className={inputClass}><option value="en">{t("options.english")}</option><option value="es">{t("options.spanish")}</option></select></label>
              <label className={`${labelClass} sm:col-span-2`}>{t("fields.title")}<input name="title" defaultValue={currentEvent.title} placeholder={t("placeholders.title")} onInput={(e) => setPreviewTitle(e.currentTarget.value)} className={inputClass} /><FieldError name="title" errors={errors} /></label>
              <label className={`${labelClass} sm:col-span-2`}>{t("fields.honorees")}<input name="honoreeNames" defaultValue={currentEvent.honoreeNames} placeholder={t("placeholders.honorees")} className={inputClass} /><FieldError name="honoreeNames" errors={errors} /></label>
              <div className="sm:col-span-2">
                <label className={labelClass}>{t("fields.description")}<textarea name="description" defaultValue={currentEvent.description} placeholder={t("placeholders.description")} onInput={(e) => setPreviewDescription(e.currentTarget.value)} rows={4} className={inputClass} /></label>
                <button type="button" disabled={wordingBusy} onClick={() => void suggestWording()} className="mt-3 min-h-11 rounded-md border border-[#6D456F] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] disabled:opacity-50">{wordingBusy ? t("wording.suggesting") : t("wording.suggest")}</button>
                {wordingError && <p role="alert" className="mt-2 text-sm text-[#A33A3A]">{wordingError}</p>}
                {wordingSuggestion && (
                  <div className="mt-3 border-l-2 border-[#6D456F] bg-[#F1EDF4] px-4 py-3 text-sm">
                    <p className="font-semibold text-[#2B2231]">{t("wording.title")}</p>
                    <p className="mt-2 leading-6 text-[#55485a]">{wordingSuggestion.description}</p>
                    {wordingSuggestion.styleNote && <p className="mt-2 text-xs text-[#675d6a]">{wordingSuggestion.styleNote}</p>}
                    <button type="button" onClick={applySuggestedDescription} className="mt-3 min-h-11 rounded-md bg-[#6D456F] px-4 py-2 font-semibold text-white">{t("wording.apply")}</button>
                  </div>
                )}
              </div>
              <label className={`${labelClass} sm:col-span-2`}>{t("fields.timezone")}<input name="timezone" defaultValue={currentEvent.timezone} placeholder={t("placeholders.timezone")} className={inputClass} /><FieldError name="timezone" errors={errors} /></label>
              <label className={labelClass}>{t("fields.startsAt")}<input type="datetime-local" name="startsAt" defaultValue={toLocalInput(currentEvent.startsAt, currentEvent.timezone)} className={inputClass} /><FieldError name="startsAt" errors={errors} /></label>
              <label className={labelClass}>{t("fields.endsAt")}<input type="datetime-local" name="endsAt" defaultValue={toLocalInput(currentEvent.endsAt, currentEvent.timezone)} className={inputClass} /><FieldError name="endsAt" errors={errors} /></label>
              <label className={labelClass}>{t("fields.venue")}<input name="venueName" defaultValue={currentEvent.venueName ?? ""} placeholder={t("placeholders.venue")} className={inputClass} /><FieldError name="venueName" errors={errors} /></label>
              <label className={labelClass}>{t("fields.address")}<input name="address" defaultValue={currentEvent.address ?? ""} placeholder={t("placeholders.address")} className={inputClass} /><FieldError name="address" errors={errors} /></label>
              <label className={`${labelClass} sm:col-span-2`}>{t("fields.mapUrl")}<input type="url" name="mapUrl" defaultValue={currentEvent.mapUrl ?? ""} placeholder={t("placeholders.mapUrl")} className={inputClass} /></label>
            </div>
            {mode === "founder" && (
              <div className="mt-6 border-l-2 border-[#6D456F] bg-[#F1EDF4] px-4 py-4">
                <label className={labelClass}>
                  {t("fields.publicSubdomain")}
                  <span className="mt-2 flex items-center rounded-md border border-[#d8cedc] bg-white focus-within:border-[#6D456F] focus-within:ring-2 focus-within:ring-[#6D456F]/20">
                    <input
                      name="publicSubdomain"
                      defaultValue={currentEvent.publicSubdomain ?? ""}
                      onBlur={(event) => void checkPublicSubdomain(event.currentTarget.value)}
                      className="min-h-11 min-w-0 flex-1 rounded-l-md px-3 py-2 text-[16px] outline-none"
                    />
                    <span className="pr-3 text-sm font-normal text-[#675d6a]">.siteforowners.com</span>
                  </span>
                </label>
                <p className="mt-2 text-xs leading-5 text-[#675d6a]">{subdomainFeedback || t("publicDomainHelp")}</p>
                <FieldError name="publicSubdomain" errors={errors} />
              </div>
            )}
            <details data-travel-editor open={Boolean(currentEvent.travelInfo?.airports.length || currentEvent.travelInfo?.hotels.length)} className="group mt-8 border-t border-[#ddd4e1] pt-5">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-lg font-semibold text-[#2B2231] outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F] [&::-webkit-details-marker]:hidden">
                {t("travel.heading")}<span aria-hidden="true" className="text-2xl font-normal transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("travel.help")}</p>
              <div className="mt-6 space-y-5">
                <fieldset>
                  <legend className="text-base font-semibold text-[#2B2231]">{t("travel.airports")}</legend>
                  <div className="mt-3 space-y-4">
                    {Array.from({ length: 3 }, (_, index) => {
                      const airport = currentEvent.travelInfo?.airports[index];
                      return (
                        <div key={`airport-${index}`} className="grid gap-3 border-l-2 border-[#cfc3d3] pl-4 sm:grid-cols-2">
                          <label className={labelClass}>{t("travel.airportName", { number: index + 1 })}<input name={`airportName${index}`} defaultValue={airport?.name ?? ""} placeholder={t("travel.airportNamePlaceholder")} className={inputClass} /></label>
                          <label className={labelClass}>{t("travel.airportNote")}<input name={`airportNote${index}`} defaultValue={airport?.note ?? ""} placeholder={t("travel.airportNotePlaceholder")} className={inputClass} /></label>
                          <label className={`${labelClass} sm:col-span-2`}>{t("travel.directionsLink")}<input type="url" name={`airportDirectionsUrl${index}`} defaultValue={airport?.directionsUrl ?? ""} placeholder={t("travel.directionsLinkPlaceholder")} className={inputClass} /></label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset className="border-t border-[#e6dfe8] pt-5">
                  <legend className="text-base font-semibold text-[#2B2231]">{t("travel.hotels")}</legend>
                  <p className="mt-1 text-sm text-[#675d6a]">{t("travel.hotelsHelp")}</p>
                  <label className="mt-3 flex min-h-11 items-center gap-2 text-sm font-medium text-[#55485a]"><input type="radio" name="recommendedHotel" value="-1" defaultChecked={!currentEvent.travelInfo?.hotels.some((hotel) => hotel.recommended)} />{t("travel.noRecommendation")}</label>
                  <div className="space-y-4">
                    {Array.from({ length: 5 }, (_, index) => {
                      const hotel = currentEvent.travelInfo?.hotels[index];
                      return (
                        <div key={`hotel-${index}`} className="grid gap-3 border-l-2 border-[#cfc3d3] pl-4 sm:grid-cols-2">
                          <label className={labelClass}>{t("travel.hotelName", { number: index + 1 })}<input name={`hotelName${index}`} defaultValue={hotel?.name ?? ""} placeholder={t("travel.hotelNamePlaceholder")} className={inputClass} /></label>
                          <label className={labelClass}>{t("travel.hotelAddress")}<input name={`hotelAddress${index}`} defaultValue={hotel?.address ?? ""} placeholder={t("travel.hotelAddressPlaceholder")} className={inputClass} /></label>
                          <label className="flex min-h-11 items-center gap-2 text-sm font-medium text-[#55485a] sm:col-span-2"><input type="radio" name="recommendedHotel" value={index} defaultChecked={hotel?.recommended} />{t("travel.markRecommended")}</label>
                        </div>
                      );
                    })}
                  </div>
                </fieldset>
              </div>
              <FieldError name="travelInfo" errors={errors} />
            </details>
          </section>

          <section id="design" className={sectionClass}>
            <SectionHeading title={t("sections.design")} help={t("sectionHelp.design")} />
            <fieldset>
              <legend className={labelClass}>{t("fields.theme")}</legend>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {(["classic", "romantic", "celebration"] as const).map((theme) => (
                  <label key={theme} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-[#d8cedc] bg-white px-3 py-2 text-sm font-medium has-[:checked]:border-[#6D456F] has-[:checked]:bg-[#F1EDF4]">
                    <input type="radio" name="themeKey" value={theme} defaultChecked={currentEvent.themeKey === theme || (theme === "classic" && !["romantic", "celebration"].includes(currentEvent.themeKey))} onChange={() => setPreviewTheme(theme)} />
                    {t(`options.theme${theme[0]?.toUpperCase()}${theme.slice(1)}`)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-5 grid gap-5 sm:grid-cols-3">
              <label className={labelClass}>{t("fields.fontPair")}<select name="fontPairKey" value={previewFont} onChange={(e) => setPreviewFont(e.target.value)} className={inputClass}><option value="fraunces-geist">{t("options.fontExpressive")}</option><option value="geist-geist">{t("options.fontClean")}</option></select></label>
              <label className={labelClass}>{t("fields.primaryColor")}<input type="color" name="primaryColor" value={previewPrimary} onChange={(e) => setPreviewPrimary(e.target.value)} className={`${inputClass} p-1`} /></label>
              <label className={labelClass}>{t("fields.accentColor")}<input type="color" name="accentColor" value={previewAccent} onChange={(e) => setPreviewAccent(e.target.value)} className={`${inputClass} p-1`} /></label>
            </div>
            <div className="mt-8 border-b border-[#ddd4e1]" onChange={(eventChange) => eventChange.stopPropagation()}>
              <div className="border-l-2 border-[#6D456F] bg-[#F1EDF4] px-4 py-3">
                <h3 className="font-semibold text-[#2B2231]">{t("media.heading")}</h3>
                <p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("media.help")}</p>
              </div>
              {singletonMediaRow("designed_invite", t("media.designedInvite"), t("media.imageLimit"), media.designedInvite)}
              {singletonMediaRow("cover", t("media.cover"), t("media.imageLimit"), media.cover)}
              {singletonMediaRow("video", t("media.video"), t("media.videoLimit"), media.video)}
              <div className="border-t border-[#ddd4e1] py-5">
                <h3 className="text-sm font-semibold">{t("reference.title")}</h3>
                <p className="mt-1 text-xs leading-5 text-[#675d6a]">{t("reference.help")}</p>
                <button type="button" disabled={!media.designedInvite || analyzing} onClick={() => void analyzeReference()} className="mt-3 min-h-11 rounded-md border border-[#6D456F] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] disabled:opacity-50">{analyzing ? t("reference.analyzing") : t("reference.analyze")}</button>
                {analysisError && <p role="alert" className="mt-3 text-sm text-[#A33A3A]">{analysisError}</p>}
                {analysis && <ReferenceImportReview analysis={analysis} onApply={applyReference} />}
              </div>
              <div className="border-t border-[#ddd4e1] py-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#2B2231]">{t("media.gallery")}</h3>
                    <p className="mt-1 text-xs leading-5 text-[#675d6a]">{t("media.imageLimit")}</p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold text-[#6D456F]">{t("media.galleryCount", { count: media.gallery.length })}</p>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                  <label className={labelClass}>
                    {t("media.altLabel")}
                    <input
                      name="galleryAltText"
                      form="invitation-media-gallery-upload"
                      maxLength={240}
                      value={galleryAltText}
                      onChange={(eventChange) => setGalleryAltText(eventChange.target.value)}
                      placeholder={t("media.altPlaceholder")}
                      className={inputClass}
                    />
                  </label>
                  <label htmlFor="invitation-media-gallery" className={`inline-flex min-h-11 items-center justify-center rounded-md border border-[#b9aabc] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] focus-within:ring-2 focus-within:ring-[#6D456F] focus-within:ring-offset-2 ${media.gallery.length >= 12 || mediaBusy !== null ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
                    {t("media.addPhoto")}
                    <input
                      id="invitation-media-gallery"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={media.gallery.length >= 12 || mediaBusy !== null}
                      className="sr-only"
                      onChange={(eventChange) => {
                        eventChange.stopPropagation();
                        const file = eventChange.currentTarget.files?.[0];
                        if (file) void uploadMedia("gallery", file);
                        eventChange.currentTarget.value = "";
                      }}
                    />
                  </label>
                </div>
                {media.gallery.length >= 12 && <p className="mt-2 text-sm font-medium text-[#675d6a]">{t("media.galleryFull")}</p>}
                {media.gallery.length > 0 && (
                  <ul className="mt-5 grid gap-4 sm:grid-cols-2">
                    {media.gallery.map((item) => (
                      <li key={item.id ?? item.path} className="border-l-2 border-[#cfc3d3] pl-3">
                        {mediaPreview(item, item.altText ?? "")}
                        <p className="mt-2 text-sm text-[#55485a]">{item.altText}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-3">
                          <label htmlFor={`invitation-media-gallery-${item.id}`} className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[#55405a] underline underline-offset-4 focus-within:ring-2 focus-within:ring-[#6D456F]">
                            {t("media.replace")}
                            <input
                              id={`invitation-media-gallery-${item.id}`}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              disabled={mediaBusy !== null}
                              className="sr-only"
                              onChange={(eventChange) => {
                                eventChange.stopPropagation();
                                const file = eventChange.currentTarget.files?.[0];
                                if (file) void uploadMedia("gallery", file, item);
                                eventChange.currentTarget.value = "";
                              }}
                            />
                          </label>
                          <button type="button" disabled={mediaBusy !== null} onClick={() => void removeMedia(item)} className="min-h-11 text-sm font-semibold text-[#7f2929] underline underline-offset-4 disabled:opacity-50">{t("media.remove")}</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {mediaBusy && (
                <div aria-live="polite" className="border-t border-[#ddd4e1] py-3 text-sm font-medium text-[#55485a]">
                  {mediaProgress === null ? t("media.working") : t("media.uploading", { percent: mediaProgress })}
                  {mediaProgress !== null && <progress value={mediaProgress} max={100} className="mt-2 block h-2 w-full accent-[#6D456F]" />}
                </div>
              )}
              {mediaError && <p role="alert" className="border-t border-[#e5bcbc] bg-red-50 px-3 py-3 text-sm text-[#7f2929]">{mediaError}</p>}
            </div>
          </section>

          <section id="rsvp" className={sectionClass}>
            <SectionHeading title={t("sections.rsvp")} help={t("sectionHelp.rsvp")} />
            <div className="grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>{t("fields.deadline")}<input type="datetime-local" name="rsvpDeadline" defaultValue={toLocalInput(currentEvent.rsvpDeadline, currentEvent.timezone)} className={inputClass} /><FieldError name="rsvpDeadline" errors={errors} /></label>
              <label className={labelClass}>{t("fields.capacity")}<input type="number" min="1" step="1" name="capacity" defaultValue={currentEvent.capacity ?? ""} className={inputClass} /><FieldError name="capacity" errors={errors} /></label>
              <label className={labelClass}>{t("fields.passcode")}<input type="password" name="passcode" minLength={4} autoComplete="new-password" placeholder={t("placeholders.passcode")} className={inputClass} /><span className="mt-1.5 block text-xs font-normal leading-5 text-[#675d6a]">{t("passcodeHelp")}</span><FieldError name="passcode" errors={errors} /></label>
              <label className={labelClass}>{t("fields.expireAt")}<input type="datetime-local" name="expireAt" defaultValue={toLocalInput(currentEvent.expireAt, currentEvent.timezone)} className={inputClass} /><FieldError name="expireAt" errors={errors} /></label>
            </div>
            <div className="mt-5 divide-y divide-[#ddd4e1] border-y border-[#ddd4e1]">
              {[
                ["showPublicRsvpCount", "publicCount", currentEvent.showPublicRsvpCount],
                ["ownerEmailNotifications", "emailNotifications", currentEvent.ownerEmailNotifications],
                ["ownerSmsNotifications", "smsNotifications", currentEvent.ownerSmsNotifications],
                ["guestEmailConfirmations", "guestConfirmations", currentEvent.guestEmailConfirmations],
              ].map(([name, label, checked]) => (
                <label key={String(name)} className="flex min-h-12 items-center justify-between gap-4 py-3 text-sm font-medium"><span>{t(`fields.${label}`)}</span><input type="checkbox" name={String(name)} defaultChecked={Boolean(checked)} className="h-5 w-5 accent-[#6D456F]" /></label>
              ))}
              <label className="block py-3 text-sm font-semibold">{t("fields.removePasscode")}<input type="checkbox" name="removePasscode" className="ml-3 h-5 w-5 align-middle accent-[#6D456F]" /></label>
            </div>
            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <label className={labelClass}>{t("fields.notificationEmail")}<input type="email" name="notificationEmail" defaultValue={currentEvent.notificationEmail ?? ""} className={inputClass} /><FieldError name="notificationEmail" errors={errors} /></label>
              <label className={labelClass}>{t("fields.notificationPhone")}<input type="tel" name="notificationPhone" defaultValue={currentEvent.notificationPhone ?? ""} className={inputClass} /><FieldError name="notificationPhone" errors={errors} /></label>
            </div>
            {mode === "founder" && (
              <fieldset className="mt-7 border-l-2 border-[#6D456F] bg-[#F1EDF4] px-4 py-5">
                <legend className="px-1 text-sm font-semibold">{t("founderControls")}</legend>
                <p className="mb-3 text-sm font-semibold text-[#55485a]">{t("founderLimitsHelp")}</p>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className={labelClass}>{t("fields.submissionLimit")}<input type="number" min="1" name="submissionLimit" defaultValue={currentEvent.submissionLimit} className={inputClass} /></label>
                  <label className={labelClass}>{t("fields.emailLimit")}<input type="number" min="1" name="emailNotificationLimit" defaultValue={currentEvent.emailNotificationLimit} className={inputClass} /></label>
                  <label className={labelClass}>{t("fields.smsLimit")}<input type="number" min="1" name="smsNotificationLimit" defaultValue={currentEvent.smsNotificationLimit} className={inputClass} /></label>
                </div>
              </fieldset>
            )}
          </section>

          <section id="preview" className={sectionClass}>
            <SectionHeading title={t("sections.preview")} help={t("sectionHelp.preview")} />
            <div data-mobile-preview="true" className="mb-6 overflow-hidden rounded-lg border border-[#cfc3d3] bg-white lg:hidden">
              <div className="h-2" style={{ backgroundColor: previewAccent }} />
              <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-8 text-center" style={{ backgroundColor: previewBackground, color: previewText }}>
                <p className="text-sm opacity-70">{currentEvent.eventType}</p>
                <h2 className={`mt-5 text-3xl leading-tight ${previewFont === "fraunces-geist" ? "font-[family-name:var(--font-fraunces)]" : "font-sans"}`}>{previewTitle || t("placeholders.title")}</h2>
                <div className="my-5 h-px w-12" style={{ backgroundColor: previewAccent }} />
                <p className="text-sm leading-6 opacity-80">{previewDescription || t("placeholders.description")}</p>
                <p className="mt-7 text-sm font-semibold">{dateLabel}</p>
                <p className="mt-1 text-sm">{currentEvent.venueName || t("previewVenuePending")}</p>
              </div>
            </div>
            {errors.status && <p role="alert" className="mb-4 text-sm text-[#A33A3A]">{errors.status}</p>}
            {(dirty || saving) && <p className="mb-4 text-sm text-[#675d6a]">{t("saveBeforeStatus")}</p>}
            {Object.entries(errors).filter(([key]) => !["form", "status"].includes(key)).length > 0 && (
              <ul className="mb-4 border-l-4 border-[#A33A3A] bg-red-50 px-4 py-3 text-sm text-[#7f2929]">
                {Object.entries(errors).filter(([key]) => !["form", "status"].includes(key)).map(([key, message]) => <li key={key}>{message}</li>)}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {statusCommands(status).map((command) => (
                <button key={command} type="button" disabled={statusBusy || saving || dirty} onClick={() => changeStatus(command)} className="min-h-11 rounded-md border border-[#b9aabc] bg-white px-4 py-2 text-sm font-semibold text-[#55405a] disabled:opacity-50">{t(`actions.${command}`)}</button>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-3 text-sm font-semibold">
              <a href={`/invitations/preview/${currentEvent.id}`} target="_blank" rel="noreferrer" className="text-[#6D456F] underline decoration-[#bca9c0] underline-offset-4">{t("actions.openPreview")}</a>
              <button type="button" onClick={() => navigator.clipboard.writeText(invitationPublicUrl(currentEvent, window.location.origin))} className="text-[#6D456F] underline decoration-[#bca9c0] underline-offset-4">{t("actions.copyLink")}</button>
            </div>
            <p className="mt-3 break-all text-xs text-[#675d6a]">{invitationPublicUrl(currentEvent)}</p>
          </section>

        </div>

        <aside className="hidden py-8 lg:block">
          <div className="sticky top-6">
            <div className="mb-3 flex items-center justify-between text-sm"><span className="text-[#675d6a]">{t("status.label")}</span><strong className="text-[#6D456F]">{t(`status.${status}`)}</strong></div>
            <div className="overflow-hidden rounded-lg border border-[#cfc3d3] bg-white shadow-[0_12px_40px_rgba(67,43,71,0.09)]">
              <div className="h-2" style={{ backgroundColor: previewAccent }} />
              <div className="flex min-h-[430px] flex-col items-center justify-center px-7 py-10 text-center" style={{ backgroundColor: previewBackground, color: previewText }}>
                <p className="text-sm opacity-70">{currentEvent.eventType}</p>
                <h2 className={`mt-6 text-4xl leading-tight ${previewFont === "fraunces-geist" ? "font-[family-name:var(--font-fraunces)]" : "font-sans"}`}>{previewTitle || t("placeholders.title")}</h2>
                <div className="my-6 h-px w-12" style={{ backgroundColor: previewAccent }} />
                <p className="text-sm leading-6 opacity-80">{previewDescription || t("placeholders.description")}</p>
                <p className="mt-8 text-sm font-semibold">{dateLabel}</p>
                <p className="mt-1 text-sm">{currentEvent.venueName || t("previewVenuePending")}</p>
              </div>
            </div>
          </div>
        </aside>

        </fieldset>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[#cfc3d3] bg-white/95 px-4 py-3 backdrop-blur lg:static lg:col-start-2 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0">
          <div className="mx-auto flex max-w-[680px] items-center justify-between gap-4 lg:pb-8">
            <p aria-live="polite" className={`text-sm font-medium ${dirty ? "text-[#A33A3A]" : saved ? "text-[#2F6B4F]" : "text-[#675d6a]"}`}>{dirty ? t("dirty") : saved ? t("actions.saved") : t("clean")}</p>
            <button type="submit" disabled={!dirty || saving} className="min-h-11 shrink-0 rounded-md bg-[#6D456F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#5d3b5f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D456F] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45">{saving ? t("actions.saving") : t("actions.save")}</button>
          </div>
        </div>
      </form>
      <div className="mx-auto grid max-w-[1380px] lg:grid-cols-[180px_minmax(0,680px)_minmax(280px,1fr)] lg:gap-10 lg:px-8">
        <section id="responses" className="scroll-mt-24 px-4 py-7 sm:px-6 lg:col-start-2 lg:col-span-2 lg:px-0 lg:py-8">
          <SectionHeading title={t("sections.responses")} help={t("sectionHelp.responses")} />
          <ResponsesDashboard eventId={currentEvent.id} mode={mode} />
        </section>
      </div>
      {mode === "founder" && (
        <form key={`${currentEvent.owner.id}:${currentEvent.owner.updatedAt}`} data-credentials-form="true" onSubmit={saveCredentials} onChange={markCredentialDirty} className="mx-auto mt-8 max-w-[680px] border-l-2 border-[#6D456F] bg-[#F1EDF4] px-4 py-5 sm:px-6">
          <fieldset disabled={credentialSaving} className="border-0 p-0">
            <h2 className="text-lg font-semibold text-[#2B2231]">{t("founderControls")}</h2>
            <p className="mt-1 text-sm leading-6 text-[#675d6a]">{t("credentialsHelp")}</p>
            {credentialErrors.form && <p role="alert" className="mt-4 text-sm text-[#A33A3A]">{credentialErrors.form}</p>}
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className={labelClass}>{t("fields.ownerName")}<input name="ownerName" defaultValue={currentEvent.owner.name} className={inputClass} /><FieldError name="ownerName" errors={credentialErrors} /></label>
              <label className={labelClass}>{t("fields.ownerEmail")}<input type="email" name="ownerEmail" defaultValue={currentEvent.owner.email} className={inputClass} /><FieldError name="ownerEmail" errors={credentialErrors} /><FieldError name="ownerEmailTaken" errors={credentialErrors} /></label>
              <label className={labelClass}>{t("fields.ownerPhone")}<input type="tel" name="ownerPhone" defaultValue={currentEvent.owner.phone ?? ""} className={inputClass} /><FieldError name="ownerPhone" errors={credentialErrors} /></label>
              <label className={labelClass}>{t("fields.newOwnerPin")}<input type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="newOwnerPin" autoComplete="new-password" className={inputClass} /><FieldError name="newOwnerPin" errors={credentialErrors} /></label>
            </div>
          </fieldset>
          <div className="mt-5 flex items-center justify-between gap-4">
            <p aria-live="polite" className={`text-sm font-medium ${credentialDirty ? "text-[#A33A3A]" : credentialSaved ? "text-[#2F6B4F]" : "text-[#675d6a]"}`}>{credentialDirty ? t("dirty") : credentialSaved ? t("actions.saved") : t("clean")}</p>
            <button type="submit" disabled={!credentialDirty || credentialSaving} className="min-h-11 shrink-0 rounded-md bg-[#6D456F] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-45">{credentialSaving ? t("actions.saving") : t("actions.save")}</button>
          </div>
        </form>
      )}
    </div>
  );
}
