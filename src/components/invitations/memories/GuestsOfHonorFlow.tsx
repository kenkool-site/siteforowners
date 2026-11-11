"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, Info, Lock, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { HonorGlyph } from "./HonorMark";
import {
  consentAudience,
  findCta,
  honorProfileForEventType,
  joinNames,
  type HonorFaceDraft,
  type HonorIcon,
  type HonorProfile,
  type HonorRoleKey,
  type HostHonorFace,
  type HostHonorState,
} from "@/lib/invitations/memories/guests-of-honor";

const GREEN = "#1f4a2c";
const INK = "#1c2a20";
const LINE = "#dedbd0";
const CARD = "#fbfaf6";
const MUTED = "#69736a";

export interface HonorSitePhoto {
  ref: string;
  kind: "cover" | "gallery" | "designed_invite";
  label: string;
  url: string;
}

type Step = "settings" | "picker" | "confirm" | "processing" | "review";

export function HonorManageLink({ href }: { href: string }) {
  const t = useTranslations("invitations.manage.dashboard.honorees");
  return <Link href={href} className="inline-flex min-h-11 items-center rounded-md bg-[#1f4a2c] px-4 text-sm font-semibold text-white">{t("title")}</Link>;
}

const ROLE_MESSAGE: Record<HonorRoleKey, "roleBride" | "roleGroom" | "roleBirthdayStar" | "roleCouple" | "roleGraduate" | "roleHonoree" | "roleSpeaker" | "roleGuest"> = {
  bride: "roleBride",
  groom: "roleGroom",
  birthday_star: "roleBirthdayStar",
  couple: "roleCouple",
  graduate: "roleGraduate",
  honoree: "roleHonoree",
  speaker: "roleSpeaker",
  guest_of_honor: "roleGuest",
};

function roleLabel(t: (key: string) => string, roleKey: string): string {
  const message = ROLE_MESSAGE[roleKey as HonorRoleKey];
  return t(message ?? "roleGuest");
}

function kindLabel(t: (key: string) => string, profile: HonorProfile): string {
  return t(profile.kindLabelKey);
}

function countLabel(t: (key: string, values?: Record<string, string | number>) => string, profile: HonorProfile): string {
  if (profile.typicalCount === 1) return t("countOne");
  if (profile.typicalCount === null) return t("countFlexible");
  return t("countPeople", { count: profile.typicalCount });
}

function stepFor(state: HostHonorState | null): Step {
  if (!state || state.status === "empty") return "settings";
  if (state.status === "ready" || state.status === "processing") return "review";
  if (state.faces.length > 0) return "confirm";
  return "settings";
}

function Shell({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  const t = useTranslations("invitations.manage.dashboard.honorees");
  return (
    <div className="min-h-screen bg-[#efede5] text-[#1c2a20]">
      <div className="mx-auto min-h-screen max-w-md px-4 pb-10">
        <header className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button type="button" onClick={onBack} className="grid size-9 shrink-0 place-items-center rounded-full bg-white text-[#1f4a2c]" aria-label={t("settingsTitle")}>
              <ChevronLeft className="size-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate font-serif text-base font-semibold text-[#1f4a2c]">{title}</h1>
              <p className="truncate text-xs text-[#69736a]">{subtitle}</p>
            </div>
          </div>
          <span className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-[#f3efe4] px-2.5 text-xs font-semibold text-[#6d5c3a]">
            <Lock className="size-3.5" />{t("hostOnly")}
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}

export function HonorSettingsCard({
  eventTitle,
  eventType,
  brandingOn,
  reviewRequired,
  configured,
  onPick,
  onBack,
}: {
  eventTitle: string;
  eventType: string;
  brandingOn: boolean;
  reviewRequired: boolean;
  configured: boolean;
  onPick: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("invitations.manage.dashboard.honorees");
  const profile = honorProfileForEventType(eventType);
  const icon: HonorIcon = profile.icon;
  return (
    <Shell title={t("settingsTitle")} subtitle={eventTitle} onBack={onBack}>
      <section className="mt-2 rounded-3xl border px-5 pb-5 pt-6 text-center" style={{ background: CARD, borderColor: LINE }}>
        <div className="relative mx-auto mb-3 h-16 w-28">
          <span className="absolute left-2 top-1 grid size-14 place-items-center rounded-full bg-[#e7ece4] text-[#1f4a2c]" style={{ transform: profile.typicalCount === 1 ? "translateX(14px)" : undefined }}>
            <HonorGlyph icon={icon} className="size-7" />
          </span>
          {profile.typicalCount !== 1 && <span className="absolute right-2 top-2 grid size-14 place-items-center rounded-full bg-[#d7e3d8] text-[#1f4a2c]"><HonorGlyph icon={icon} className="size-7" /></span>}
        </div>
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{kindLabel(t, profile)} · {countLabel(t, profile)}</p>
        <h2 className="mt-2 font-serif text-2xl font-semibold" style={{ color: GREEN }}>{t("question")}</h2>
        <p className="mt-2 text-sm leading-5" style={{ color: MUTED }}>{t("questionBody")}</p>
        <button type="button" onClick={onPick} className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: GREEN }}>
          {configured ? t("reviewExisting") : t("pickPhotos")}
        </button>
      </section>
      <p className="mt-3 flex gap-2 rounded-2xl px-3 py-3 text-xs leading-5" style={{ background: "#e3e9e1", color: INK }}>
        <Lock className="mt-0.5 size-4 shrink-0" style={{ color: GREEN }} />
        <span>{t(profile.hintKey)}</span>
      </p>
      <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide" style={{ color: MUTED }}>{t("also")}</h3>
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: LINE, background: CARD }}>
        <div className="flex items-center gap-3 border-b px-3 py-3" style={{ borderColor: LINE }}>
          <div className="min-w-0 flex-1"><b className="block text-sm">{t("branding")}</b><small className="text-xs" style={{ color: MUTED }}>{t("brandingHint")}</small></div>
          <span className="text-sm font-semibold" style={{ color: GREEN }}>{brandingOn ? t("on") : t("off")}</span>
        </div>
        <div className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1"><b className="block text-sm">{t("moderation")}</b><small className="text-xs" style={{ color: MUTED }}>{t("moderationHint")}</small></div>
          <span className="text-sm font-semibold" style={{ color: GREEN }}>{reviewRequired ? t("moderationReview") : t("moderationAuto")}</span>
        </div>
      </div>
    </Shell>
  );
}

function photoLabel(t: (key: string) => string, photo: HonorSitePhoto): string {
  if (photo.kind === "cover") return t("cover");
  if (photo.kind === "designed_invite") return t("designed");
  return photo.label.trim() || t("galleryPhoto");
}

export function GuestsOfHonorFlow({
  eventId,
  eventTitle,
  eventType,
  backHref,
  brandingOn,
  reviewRequired,
  initial,
  preview,
}: {
  eventId: string;
  eventTitle: string;
  eventType: string;
  backHref: string;
  brandingOn: boolean;
  reviewRequired: boolean;
  initial: HostHonorState | null;
  preview?: {
    screen: Step;
    photos?: HonorSitePhoto[];
    faces?: HostHonorFace[];
    consent?: boolean;
    state?: HostHonorState;
    referenceSrc?: string;
    imageFor?: (id: string) => string;
  };
}) {
  const t = useTranslations("invitations.manage.dashboard.honorees");
  const router = useRouter();
  const profile = honorProfileForEventType(eventType);
  const [step, setStep] = useState<Step>(preview?.screen ?? stepFor(initial));
  const [state, setState] = useState<HostHonorState | null>(preview?.state ?? initial);
  const [photos, setPhotos] = useState<HonorSitePhoto[]>(preview?.photos ?? []);
  const [selectedRef, setSelectedRef] = useState<string | null>(preview?.photos?.[0]?.ref ?? null);
  const [faces, setFaces] = useState<HostHonorFace[]>(preview?.faces ?? initial?.faces ?? []);
  const [consent, setConsent] = useState(Boolean(preview?.consent));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previewMode = Boolean(preview);

  function goBack() {
    if (previewMode) return;
    if (step === "picker") setStep(state?.status === "ready" ? "review" : "settings");
    else if (step === "confirm") setStep("picker");
    else if (step === "review") router.push(backHref);
    else router.push(backHref);
  }

  async function openPicker() {
    if (previewMode) return;
    if (state?.status === "ready") {
      setStep("review");
      return;
    }
    setError(null);
    setStep("picker");
    if (photos.length > 0) return;
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/guests-of-honor/photos`);
      if (!response.ok) throw new Error("photos");
      const body = await response.json() as { photos: HonorSitePhoto[] };
      setPhotos(body.photos);
      setSelectedRef(body.photos[0]?.ref ?? null);
    } catch {
      setError(t("genericError"));
    }
  }

  async function submitSelectedPhoto() {
    if (previewMode || !selectedRef) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/guests-of-honor/detect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceKind: "event_site", sourceRef: selectedRef }),
      });
      const body = await response.json() as HostHonorState & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "detect");
      setState(body);
      setFaces(body.faces);
      setConsent(false);
      setStep("confirm");
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "no_faces" ? t("noFaces") : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function uploadFile(file: File) {
    if (previewMode) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("photo", file);
      const response = await fetch(`/api/invitations/events/${eventId}/memories/guests-of-honor/detect`, { method: "POST", body: form });
      const body = await response.json() as HostHonorState & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "detect");
      setState(body);
      setFaces(body.faces);
      setConsent(false);
      setStep("confirm");
    } catch (caught) {
      setError(caught instanceof Error && caught.message === "no_faces" ? t("noFaces") : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function saveFaces() {
    if (previewMode) return;
    const drafts: HonorFaceDraft[] = faces.map((face) => ({ index: face.index, name: face.name, roleKey: face.roleKey, selected: face.selected }));
    setStep("processing");
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/guests-of-honor/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ consent, faces: drafts }),
      });
      const body = await response.json() as HostHonorState & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "confirm");
      setState(body);
      setFaces(body.faces);
      setStep("review");
    } catch {
      setError(t("genericError"));
      setStep("confirm");
    } finally {
      setBusy(false);
    }
  }

  async function exclude(mediaId: string) {
    if (previewMode || !state?.review) return;
    setState({
      ...state,
      review: {
        ...state.review,
        photos: state.review.photos.filter((photo) => photo.mediaId !== mediaId),
        total: state.review.photos.filter((photo) => photo.mediaId !== mediaId).length,
        buckets: state.review.buckets,
      },
    });
    const response = await fetch(`/api/invitations/events/${eventId}/memories/guests-of-honor/exclude`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mediaId }),
    });
    if (response.ok) setState(await response.json() as HostHonorState);
  }

  async function removeTagging() {
    if (previewMode) return;
    if (!window.confirm(t("removeConfirm"))) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/invitations/events/${eventId}/memories/guests-of-honor`, { method: "DELETE" });
      if (!response.ok) throw new Error("remove");
      const body = await response.json() as HostHonorState;
      setState(body);
      setFaces([]);
      setConsent(false);
      setStep("settings");
    } catch {
      setError(t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  const selectedNames = faces.filter((face) => face.selected && face.name.trim()).map((face) => face.name.trim());
  const audience = consentAudience(selectedNames);
  const cta = findCta(selectedNames);
  const referenceSrc = preview?.referenceSrc ?? (step === "confirm" || step === "processing" ? `/api/invitations/events/${eventId}/memories/guests-of-honor/reference` : "");

  if (step === "settings") {
    return (
      <div>
        {error && <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        <HonorSettingsCard eventTitle={eventTitle} eventType={eventType} brandingOn={brandingOn} reviewRequired={reviewRequired} configured={state?.status === "ready"} onBack={() => { if (!previewMode) router.push(backHref); }} onPick={() => { if (previewMode) return; void openPicker(); }} />
      </div>
    );
  }

  if (step === "picker") {
    return (
      <Shell title={t("title")} subtitle={eventTitle} onBack={goBack}>
        <h2 className="mt-2 font-serif text-3xl font-semibold" style={{ color: GREEN }}>{t("pickTitle")}</h2>
        <p className="mt-2 text-sm leading-5" style={{ color: MUTED }}>{t("pickLead")}</p>
        <div className="mt-4 flex items-baseline justify-between text-[11px] font-semibold uppercase tracking-wide" style={{ color: MUTED }}>
          <span>{t("fromSite")}</span><span>{t("invitationPhotos")}</span>
        </div>
        {photos.length === 0 ? <p className="mt-3 text-sm" style={{ color: MUTED }}>{t("noSitePhotos")}</p> : (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {photos.map((photo, index) => (
              <button key={photo.ref} type="button" onClick={() => setSelectedRef(photo.ref)} className={`relative overflow-hidden rounded-2xl ${index === 0 ? "col-span-3 aspect-[16/10]" : "aspect-square"}`} style={{ outline: selectedRef === photo.ref ? `3px solid ${GREEN}` : undefined }}>
                {photo.url ? <img src={photo.url} alt="" className="size-full object-cover" /> : <span className="block size-full bg-[#2a2e2c]" />}
                {index === 0 && <span className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-semibold">{photoLabel(t, photo)}</span>}
                {selectedRef === photo.ref && <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full text-white" style={{ background: GREEN }}>✓</span>}
              </button>
            ))}
          </div>
        )}
        <button type="button" onClick={() => fileRef.current?.click()} className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full border bg-white text-sm font-semibold" style={{ borderColor: LINE, color: GREEN }}>
          <Upload className="size-4" />{t("uploadDifferent")}
        </button>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file); }} />
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={!selectedRef || busy} onClick={() => void submitSelectedPhoto()} className="mt-4 h-14 w-full rounded-full text-base font-semibold text-white disabled:opacity-50" style={{ background: GREEN }}>{t("usePhoto")}</button>
      </Shell>
    );
  }

  if (step === "processing") {
    const names = joinNames(selectedNames, "ampersand");
    return (
      <Shell title={t("title")} subtitle={eventTitle} onBack={goBack}>
        <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
          <div className="relative grid size-40 place-items-center">
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-[#1f4a2c]/20 border-t-[#1f4a2c]" />
            <span className="flex -space-x-3">
              {faces.filter((face) => face.selected).slice(0, 3).map((face) => (
                <img key={face.index} src={previewMode ? (preview?.referenceSrc ?? "") : `/api/invitations/events/${eventId}/memories/guests-of-honor/face/${face.index}`} alt="" className="size-14 rounded-full border-2 border-[#efede5] object-cover" />
              ))}
            </span>
          </div>
          <h2 className="mt-6 font-serif text-3xl font-semibold" style={{ color: GREEN }}>{t("finding", { names })}</h2>
          <p className="mt-2 text-sm leading-5" style={{ color: MUTED }}>{t("processingLead", { count: state?.photoCount ?? 0 })}</p>
          <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[#dedbd0]"><span className="block h-full w-2/3 animate-pulse rounded-full" style={{ background: GREEN }} /></div>
          <p className="mt-4 text-sm" style={{ color: MUTED }}>{t("processingNote")}</p>
        </div>
      </Shell>
    );
  }

  if (step === "confirm") {
    const selectedCount = faces.filter((face) => face.selected).length;
    const consentText = audience.mode === "one"
      ? t("consentOne", { name: audience.names[0] ?? "" })
      : audience.mode === "two"
        ? t("consentTwo", { first: audience.names[0] ?? "", second: audience.names[1] ?? "" })
        : t("consentMany", { names: joinNames(audience.names, "and") });
    const canSave = consent && selectedNames.length === faces.filter((face) => face.selected).length && selectedNames.length > 0 && !busy;
    return (
      <Shell title={t("title")} subtitle={eventTitle} onBack={goBack}>
        <h2 className="mt-2 font-serif text-3xl font-semibold" style={{ color: GREEN }}>{t("confirmTitle")}</h2>
        <p className="mt-2 text-sm leading-5" style={{ color: MUTED }}>{profile.typicalCount === 1 ? t("confirmLeadOne", { count: faces.length }) : t("confirmLead", { count: faces.length })}</p>
        <div className="relative mt-4 overflow-hidden rounded-2xl bg-[#1c1f1d]">
          {referenceSrc ? <img src={referenceSrc} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] w-full bg-[#2a2e2c]" />}
          {faces.map((face) => (
            <span key={face.index} className="absolute rounded-md border-2" style={{ left: `${face.box.left * 100}%`, top: `${face.box.top * 100}%`, width: `${face.box.width * 100}%`, height: `${face.box.height * 100}%`, borderColor: face.selected ? "#fff" : "rgba(255,255,255,.45)", borderStyle: face.selected ? "solid" : "dashed" }}>
              <b className="absolute -left-1 -top-1 grid size-5 place-items-center rounded-full bg-white text-[11px] text-[#1f4a2c]">{face.index + 1}</b>
            </span>
          ))}
        </div>
        <div className="mt-3 flex items-baseline justify-between text-sm">
          <b>{selectedCount === faces.length ? t("facesCount", { count: faces.length }) : t("facesSelected", { count: faces.length, selected: selectedCount })}</b>
          <span className="text-xs" style={{ color: MUTED }}>{selectedCount === faces.length ? t("tapName") : t("turnOffExtra")}</span>
        </div>
        <ul className="mt-2 grid gap-2">
          {faces.map((face) => (
            <li key={face.index} className={`flex items-center gap-3 rounded-2xl border bg-white p-2 ${face.selected ? "" : "opacity-60"}`} style={{ borderColor: LINE }}>
              <img src={previewMode && preview?.referenceSrc ? preview.referenceSrc : `/api/invitations/events/${eventId}/memories/guests-of-honor/face/${face.index}`} alt="" className="size-12 rounded-full object-cover" />
              <div className="min-w-0 flex-1">
                {face.selected ? (
                  <input aria-label={t("namePlaceholder")} value={face.name} placeholder={t("namePlaceholder")} onChange={(event) => setFaces((current) => current.map((item) => item.index === face.index ? { ...item, name: event.target.value } : item))} className="h-9 w-full rounded-lg border px-2 text-sm font-semibold" style={{ borderColor: GREEN }} />
                ) : <p className="text-sm font-semibold">{t("notHonor")}</p>}
                <div className="mt-1 flex flex-wrap gap-1">
                  {face.selected ? profile.roles.map((role) => (
                    <button key={role} type="button" onClick={() => setFaces((current) => current.map((item) => item.index === face.index ? { ...item, roleKey: role } : item))} className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: face.roleKey === role ? GREEN : "#e7ece4", color: face.roleKey === role ? "#fff" : INK }}>{roleLabel(t, role)}</button>
                  )) : <span className="rounded-full bg-[#e7ece4] px-2 py-0.5 text-[11px] font-semibold">{t("roleOff")}</span>}
                </div>
              </div>
              <button type="button" aria-pressed={face.selected} onClick={() => setFaces((current) => current.map((item) => item.index === face.index ? { ...item, selected: !item.selected } : item))} className="grid size-7 shrink-0 place-items-center rounded-full border" style={{ background: face.selected ? GREEN : "transparent", borderColor: face.selected ? GREEN : LINE, color: "#fff" }}>
                {face.selected ? "✓" : ""}
              </button>
            </li>
          ))}
        </ul>
        <label className="mt-3 flex items-start gap-2 text-sm leading-5">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-4 accent-[#1f4a2c]" />
          <span>{selectedNames.length ? consentText : t("consentOne", { name: "—" })}</span>
        </label>
        {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
        <button type="button" disabled={!canSave} onClick={() => void saveFaces()} className="mt-4 h-14 w-full rounded-full text-base font-semibold text-white disabled:opacity-50" style={{ background: GREEN }}>
          {cta.mode === "one" ? t("saveOne", { name: cta.name ?? "" }) : t("saveMany")}
        </button>
      </Shell>
    );
  }

  const review = state?.review;
  const shown = review?.photos.slice(0, 8) ?? [];
  const extra = (review?.photos.length ?? 0) - shown.length;
  return (
    <Shell title={t("title")} subtitle={eventTitle} onBack={goBack}>
      <h2 className="mt-2 font-serif text-3xl font-semibold" style={{ color: GREEN }}>{t("foundTitle", { count: review?.total ?? 0 })}</h2>
      <p className="mt-2 text-sm leading-5" style={{ color: MUTED }}>{t("foundLead", { total: state?.photoCount ?? 0 })}</p>
      {review && review.buckets.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2">
          {review.buckets.map((bucket) => (
            <div key={bucket.key} className="rounded-2xl border bg-white px-2 py-3 text-center" style={{ borderColor: LINE }}>
              <b className="block font-serif text-2xl" style={{ color: GREEN }}>{bucket.count}</b>
              <small className="text-xs" style={{ color: MUTED }}>{bucket.labelMode === "both" ? t("bothOfYou") : bucket.labelMode === "all" ? t("allOfThem") : bucket.label}</small>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {shown.map((photo) => (
          <div key={photo.mediaId} className="relative aspect-square overflow-hidden rounded-2xl bg-[#d7e3d8]">
            <img src={preview?.imageFor ? preview.imageFor(photo.mediaId) : `/api/invitations/events/${eventId}/memories/media/${photo.mediaId}/thumbnail`} alt="" className="size-full object-cover" />
            <button type="button" onClick={() => void exclude(photo.mediaId)} className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/55 text-white" aria-label={t("removeTagging")}><X className="size-3.5" /></button>
            <span className="absolute bottom-1.5 left-1.5 rounded-full bg-[#fbfaf6]/95 px-2 py-0.5 text-[10px] font-semibold text-[#1f4a2c]">{photo.labelMode === "both" ? t("bothOfYou") : photo.labelMode === "all" ? t("allOfThem") : photo.label}</span>
          </div>
        ))}
        {extra > 0 && <div className="grid aspect-square place-items-center rounded-2xl bg-[#e3e9e1] text-sm font-semibold">+{extra}</div>}
      </div>
      <p className="mt-3 flex gap-2 text-xs leading-5" style={{ color: MUTED }}><Info className="mt-0.5 size-4 shrink-0" />{t("excludeHint")}</p>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      {state?.lastError && <p role="alert" className="mt-2 text-sm text-red-700">{t("genericError")}</p>}
      <button type="button" onClick={() => { if (!previewMode) router.push(backHref); }} className="mt-4 h-14 w-full rounded-full text-base font-semibold text-white" style={{ background: GREEN }}>{t("looksGood")}</button>
      <button type="button" onClick={() => void removeTagging()} disabled={busy} className="mt-3 block w-full text-center text-sm font-semibold text-red-800">{t("removeTagging")}</button>
    </Shell>
  );
}
