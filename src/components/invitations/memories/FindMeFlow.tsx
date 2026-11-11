"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Check, Lock, Shield, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { MediaLightbox } from "./MediaLightbox";
import { defaultMediaSrc, type MediaImageSrc } from "./media-src";
import { PlanningSoftLink } from "./MemoriesChrome";

function ScanFaceMark() {
  return <svg viewBox="0 0 24 24" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /><path d="M9 10.5v.5M15 10.5v.5M9 15c1.5 1.2 4.5 1.2 6 0" /></svg>;
}

function PlanningNote({ slug, accent, surface }: { slug: string; accent: string; surface: string }) {
  return <PlanningSoftLink slug={slug} accent={accent} surface={surface} text={accent} content="album" />;
}

type FindMeStatus = "idle" | "searching" | "results" | "empty" | "rate_limited" | "error";

// Rekognition only accepts JPEG/PNG and has a hard 5MB limit on image bytes.
// The selfie is the shared source image across every comparison in a
// search, so a badly-formatted or oversized one would fail the whole
// search (unlike a single bad candidate, which is now isolated per-item) —
// checked here, client-side, on the File object's own type/size before ever
// attempting the request.
const ACCEPTED_SELFIE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_SELFIE_BYTES = 5 * 1024 * 1024;

export function FindMeFlow({ eventId, accent, surface, onClose, eventTitle = "", photoCount = 0, slug = "", branding = false, previewResults, imageSrc = defaultMediaSrc }: { eventId: string; accent: string; surface: string; onClose: () => void; eventTitle?: string; photoCount?: number; slug?: string; branding?: boolean; previewResults?: PublicMemoryMedia[]; imageSrc?: MediaImageSrc }) {
  const t = useTranslations("invitations.public.memories.findMe");
  const tr = useTranslations("invitations.public.memories.redesign");
  const [status, setStatus] = useState<FindMeStatus>(previewResults && previewResults.length > 0 ? "results" : "idle");
  const [results, setResults] = useState<PublicMemoryMedia[]>(previewResults ?? []);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Explicit, affirmative gate — the guest must actively check this before
  // the capture button becomes usable at all, rather than consent being
  // implied by the mere presence of descriptive copy on screen. This is the
  // mechanism half of biometric-consent practice; the exact wording is not
  // a substitute for legal review in jurisdictions with specific statutory
  // requirements (e.g. Illinois' BIPA).
  const [agreed, setAgreed] = useState(false);
  const [selfieGone, setSelfieGone] = useState(false);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  // Locks background scroll while this full-screen flow is open — same fix
  // and same rationale as MediaLightbox's own scroll-lock: this component is
  // only ever mounted while showing (the caller conditionally renders it),
  // so lock on mount and restore on unmount unconditionally. overflow:hidden
  // alone doesn't reliably stop a touch-scroll on iOS Safari from reaching
  // the gallery page underneath.
  useEffect(() => {
    const scrollY = window.scrollY;
    const body = document.body;
    const previousBodyStyle = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = previousBodyStyle.position;
      body.style.top = previousBodyStyle.top;
      body.style.width = previousBodyStyle.width;
      body.style.overflow = previousBodyStyle.overflow;
      window.scrollTo(0, scrollY);
    };
  }, []);

  function resetToIdle() {
    setStatus("idle");
    setResults([]);
    setAgreed(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleFile(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file || !agreed) return;
    if (!ACCEPTED_SELFIE_TYPES.has(file.type)) {
      setStatus("error");
      return;
    }
    if (file.size > MAX_SELFIE_BYTES) {
      setStatus("error");
      return;
    }
    try {
      if (selfieUrl) URL.revokeObjectURL(selfieUrl);
      if (typeof URL.createObjectURL === "function") setSelfieUrl(URL.createObjectURL(file));
    } catch {
      setSelfieUrl(null);
    }
    setSelfieGone(false);
    setStatus("searching");
    try {
      const response = await fetch(`/api/memories/events/${eventId}/find-me`, {
        method: "POST",
        headers: { "content-type": file.type || "application/octet-stream" },
        body: file,
      });
      if (response.status === 429) {
        setStatus("rate_limited");
        return;
      }
      if (!response.ok) {
        setStatus("error");
        return;
      }
      const payload = (await response.json()) as { media?: PublicMemoryMedia[] };
      const media = Array.isArray(payload?.media) ? payload.media : [];
      setResults(media);
      setStatus(media.length > 0 ? "results" : "empty");
    } catch {
      setStatus("error");
    }
  }

  async function shareAlbum() {
    const url = window.location.href;
    if (typeof navigator.share === "function") {
      try { await navigator.share({ url }); return; } catch { /* guest dismissed the sheet */ }
    }
    await navigator.clipboard?.writeText(url);
  }

  async function downloadAll() {
    for (const item of results) {
      const response = await fetch(`/api/memories/media/${item.id}/display`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `memory-${item.id}`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="find-me-title" className="fixed inset-0 z-40 overflow-y-auto" style={{ backgroundColor: surface }}>
      <div className="flex items-center justify-between px-4 pt-4">
        <button type="button" onClick={onClose} aria-label={t("close")} className="grid size-10 place-items-center rounded-full" style={{ backgroundColor: `${accent}12`, color: accent }}>
          <X className="size-4" />
        </button>
        <span className="text-sm font-semibold opacity-60">{eventTitle}</span>
        <span className="size-10" />
      </div>

      {(status === "idle" || status === "searching") && (
        <div className="px-5 pb-28 pt-2 text-center">
          <h2 id="find-me-title" className="sr-only">{t("consentTitle")}</h2>
          <div className="mx-auto mb-3 grid size-36 place-items-center rounded-full" style={{ backgroundColor: `${accent}14`, color: accent }}><ScanFaceMark /></div>
          <p className="font-serif text-3xl font-semibold leading-tight" style={{ color: accent }}>{tr("findTitle")}</p>
          <p className="mx-6 mt-2 text-sm leading-6 opacity-70">{photoCount > 0 ? tr("findLead", { count: photoCount }) : tr("findLeadSoon")}</p>
          <ol className="mx-2 mt-5 grid gap-3 text-left text-sm font-medium">
            {[tr("stepSelfie"), tr("stepMatch"), tr("stepAlbum")].map((step, index) => (
              <li key={step} className="flex items-center gap-3"><b className="grid size-6 place-items-center rounded-full text-xs" style={{ backgroundColor: `${accent}14`, color: accent }}>{index + 1}</b>{step}</li>
            ))}
          </ol>
          <div className="mt-5 flex gap-3 rounded-2xl border p-3.5 text-left" style={{ backgroundColor: `${accent}0c`, borderColor: `${accent}22` }}>
            <Shield className="size-5 shrink-0" style={{ color: accent }} />
            <span><b className="block text-sm">{tr("privateTitle")}</b><span className="text-xs leading-5 opacity-70">{tr("privateBody")}</span></span>
          </div>
          <label className="mx-1 mt-4 flex items-start gap-2.5 text-left text-sm">
            <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} className="mt-0.5 size-5 shrink-0" style={{ accentColor: accent }} />
            {t("consentAgree")}
          </label>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png" capture="user" className="hidden" onChange={(event) => void handleFile(event.target.files)} />
          <input ref={uploadRef} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(event) => void handleFile(event.target.files)} />
          <button type="button" onClick={() => inputRef.current?.click()} disabled={!agreed || status === "searching"} className="mt-5 flex h-14 w-full items-center justify-center gap-2 rounded-full text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40" style={{ backgroundColor: accent }}>
            <Camera className="size-5" />{t("captureLabel")}
          </button>
          <button type="button" onClick={() => uploadRef.current?.click()} disabled={!agreed || status === "searching"} className="mt-3 inline-flex items-center justify-center gap-1.5 text-sm font-semibold disabled:opacity-40" style={{ color: accent }}>
            <Upload className="size-4" />{tr("uploadInstead")}
          </button>
          {status === "searching" && <p role="status" className="mt-3 text-sm font-medium">{t("searching")}</p>}
        </div>
      )}

      {status === "empty" && (
        <div className="space-y-4 p-8 text-center">
          <p className="text-sm" style={{ color: accent }}>{t("empty")}</p>
          <button type="button" onClick={resetToIdle} className="min-h-11 text-sm font-semibold" style={{ color: accent }}>
            {t("tryAgain")}
          </button>
        </div>
      )}
      {status === "error" && (
        <div className="space-y-4 p-8 text-center">
          <p role="alert" className="text-sm text-red-700">{t("error")}</p>
          <button type="button" onClick={resetToIdle} className="min-h-11 text-sm font-semibold" style={{ color: accent }}>
            {t("tryAgain")}
          </button>
        </div>
      )}
      {status === "rate_limited" && <p role="alert" className="p-8 text-center text-sm text-red-700">{t("tooManyAttempts")}</p>}

      {status === "results" && (
        <div className="space-y-4 px-4 pb-36">
          <div className="flex items-center gap-3">
            {selfieUrl && !selfieGone ? <img src={selfieUrl} alt="" className="size-16 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${surface}, 0 0 0 5px ${accent}` }} /> : <span className="grid size-16 place-items-center rounded-full" style={{ backgroundColor: `${accent}18`, color: accent }}><Check className="size-6" /></span>}
            <div>
              <h2 className="font-serif text-2xl font-semibold leading-tight" style={{ color: accent }}>{tr("youAreIn", { count: results.length })}</h2>
              <p className="text-xs opacity-70">{tr("onlyYou")}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void downloadAll()} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: accent }}>{tr("downloadAll")}</button>
            <button type="button" onClick={() => void shareAlbum()} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full border text-sm font-semibold" style={{ color: accent, borderColor: `${accent}33` }}>{tr("shareAlbum")}</button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {results.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setLightboxIndex(index)} className="aspect-square overflow-hidden rounded-lg">
                <img src={imageSrc(item.id, "thumbnail")} alt="" className="size-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between text-xs opacity-70">
            <span className="inline-flex items-center gap-1"><Lock className="size-3.5" />{tr("selfieOnly")}</span>
            <button type="button" className="font-semibold" style={{ color: accent }} onClick={() => { if (selfieUrl) URL.revokeObjectURL(selfieUrl); setSelfieUrl(null); setSelfieGone(true); }}>{tr("deleteSelfie")}</button>
          </div>
          {selfieGone && <p className="text-xs opacity-70">{tr("selfieGone")}</p>}
          <p className="sr-only">{t("resultsTitle")}</p>
          {branding && slug && <PlanningNote slug={slug} accent={accent} surface={surface} />}
        </div>
      )}

      {lightboxIndex !== null && (
        <MediaLightbox media={results} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </div>
  );
}
