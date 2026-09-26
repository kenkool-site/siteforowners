"use client";

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { useTranslations } from "next-intl";
import type { PublicMemoryMedia } from "@/lib/invitations/memories/gallery";
import { MediaLightbox } from "./MediaLightbox";

type FindMeStatus = "idle" | "searching" | "results" | "empty" | "rate_limited" | "error";

// Rekognition only accepts JPEG/PNG and has a hard 5MB limit on image bytes.
// The selfie is the shared source image across every comparison in a
// search, so a badly-formatted or oversized one would fail the whole
// search (unlike a single bad candidate, which is now isolated per-item) —
// checked here, client-side, on the File object's own type/size before ever
// attempting the request.
const ACCEPTED_SELFIE_TYPES = new Set(["image/jpeg", "image/png"]);
const MAX_SELFIE_BYTES = 5 * 1024 * 1024;

export function FindMeFlow({ eventId, accent, surface, onClose }: { eventId: string; accent: string; surface: string; onClose: () => void }) {
  const t = useTranslations("invitations.public.memories.findMe");
  const [status, setStatus] = useState<FindMeStatus>("idle");
  const [results, setResults] = useState<PublicMemoryMedia[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Explicit, affirmative gate — the guest must actively check this before
  // the capture button becomes usable at all, rather than consent being
  // implied by the mere presence of descriptive copy on screen. This is the
  // mechanism half of biometric-consent practice; the exact wording is not
  // a substitute for legal review in jurisdictions with specific statutory
  // requirements (e.g. Illinois' BIPA).
  const [agreed, setAgreed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="find-me-title" className="fixed inset-0 z-40 overflow-y-auto p-4" style={{ backgroundColor: surface }}>
      <button type="button" onClick={onClose} className="mb-4 min-h-11 text-sm font-semibold" style={{ color: accent }}>
        {t("close")}
      </button>

      {(status === "idle" || status === "searching") && (
        <div className="space-y-4 text-center">
          <h2 id="find-me-title" className="text-xl font-semibold">{t("consentTitle")}</h2>
          <p className="text-sm opacity-80">{t("consentBody")}</p>
          <label className="mx-auto flex max-w-xs items-start gap-2.5 text-left text-sm">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(event) => setAgreed(event.target.checked)}
              className="mt-0.5 size-5 shrink-0"
              style={{ accentColor: accent }}
            />
            {t("consentAgree")}
          </label>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="user"
            className="hidden"
            onChange={(event) => void handleFile(event.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!agreed || status === "searching"}
            className="mx-auto flex min-h-14 items-center justify-center gap-3 rounded-full px-6 py-3 text-base font-semibold text-white shadow-[0_8px_30px_rgba(0,0,0,0.16)] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ backgroundColor: accent }}
          >
            <Camera className="size-5" />
            {t("captureLabel")}
          </button>
          {status === "searching" && <p role="status" className="text-sm font-medium">{t("searching")}</p>}
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
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t("resultsTitle")}</h2>
          <div className="columns-2 gap-2 sm:columns-3">
            {results.map((item, index) => (
              <button key={item.id} type="button" onClick={() => setLightboxIndex(index)} className="mb-2 block w-full break-inside-avoid overflow-hidden rounded-xl">
                <img src={`/api/memories/media/${item.id}/thumbnail`} alt="" className="h-auto w-full" loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {lightboxIndex !== null && (
        <MediaLightbox media={results} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex} />
      )}
    </div>
  );
}
