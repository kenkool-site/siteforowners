"use client";

import { useRef, useState } from "react";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { AnimateSection } from "./shared/AnimateSection";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm" | "runway";

interface TemplateGalleryVideoProps {
  src: string;
  galleryVideoTitle?: string | null;
  colors: ThemeColors;
  template: TemplateName;
}

const defaultTitles: Record<TemplateName, string> = {
  classic: "Watch The Look",
  bold: "See The Work In Motion",
  elegant: "A Moment In Motion",
  vibrant: "Watch The Transformation",
  warm: "A Closer Look",
  runway: "Runway In Motion",
};

export function TemplateGalleryVideo({ src, galleryVideoTitle, colors, template }: TemplateGalleryVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const isRunway = template === "runway";
  const title = galleryVideoTitle?.trim() || defaultTitles[template];
  const background = isRunway ? "#050505" : colors.background;
  const textColor = ensureReadable(isRunway ? "#FFFFFF" : colors.foreground, background, 4.5);
  const accent = ensureReadable(colors.primary || "#B8860B", background, 3);
  const buttonText = ensureReadable(background, accent, 4.5);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPaused(false);
    } else {
      video.pause();
      setPaused(true);
    }
  }

  return (
    <section
      className="px-6 py-16 md:px-10 lg:px-16"
      style={{ backgroundColor: background, color: textColor }}
      aria-label="Featured gallery video"
    >
      <AnimateSection>
        <div className="mx-auto max-w-6xl">
          <div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div>
              <p className="mb-3 text-xs font-black uppercase tracking-[0.28em]" style={{ color: accent }}>
                Watch
              </p>
              <h2 className="max-w-3xl text-3xl font-black leading-none tracking-[-0.04em] md:text-5xl">
                {title}
              </h2>
            </div>
            <button
              type="button"
              onClick={togglePlayback}
              className="inline-flex min-h-11 items-center justify-center rounded-full px-5 text-xs font-black uppercase tracking-[0.18em] transition hover:-translate-y-0.5"
              style={{ backgroundColor: accent, color: buttonText }}
              aria-pressed={paused}
            >
              {paused ? "Play video" : "Pause video"}
            </button>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border shadow-2xl" style={{ borderColor: `${accent}55` }}>
            <video
              ref={videoRef}
              src={src}
              autoPlay
              loop
              muted
              playsInline
              className="aspect-video w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
          </div>
        </div>
      </AnimateSection>
    </section>
  );
}
