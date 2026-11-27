"use client";

import { ChevronRight, CircleAlert, Download } from "lucide-react";
import { useTranslations } from "next-intl";

export function VideoPlaybackFallback({
  durationLabel,
  sizeLabel,
  onDownload,
  onNext,
  accent = "#1f4a2c",
}: {
  durationLabel: string | null;
  sizeLabel: string | null;
  onDownload: () => void;
  onNext?: () => void;
  accent?: string;
}) {
  const t = useTranslations("invitations.public.memories.player");
  const meta = [durationLabel, sizeLabel ? t("aboutSize", { size: sizeLabel }) : null].filter(Boolean).join(" · ");
  return (
    <div className="w-full max-w-sm rounded-[28px] bg-[#fbfaf6] px-5 py-6 text-center text-[#1c2a20] shadow-2xl" role="alert">
      <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#e7efe6] text-[#1f4a2c]">
        <CircleAlert className="size-6" />
      </span>
      <h2 className="mt-4 font-serif text-2xl font-semibold leading-tight text-[#1f4a2c]">{t("cantPlayTitle")}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-[#5c675f]">{t("cantPlayBody")}</p>
      <button type="button" onClick={onDownload} className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-semibold text-white" style={{ backgroundColor: accent }}>
        <Download className="size-4" />
        {t("downloadToWatch")}
      </button>
      {onNext && (
        <button type="button" onClick={onNext} className="mt-2.5 inline-flex h-12 w-full items-center justify-center gap-1 rounded-full border border-[#d9e0d8] text-sm font-semibold text-[#1c2a20]">
          {t("nextVideo")}
          <ChevronRight className="size-4" />
        </button>
      )}
      {meta && <p className="mt-3 text-xs text-[#6d776f]">{meta}</p>}
    </div>
  );
}
