"use client";

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
  const isRunway = template === "runway";
  const title = galleryVideoTitle?.trim() || defaultTitles[template];
  const background = isRunway ? "#050505" : colors.background;
  const textColor = ensureReadable(isRunway ? "#FFFFFF" : colors.foreground, background, 4.5);
  const accent = ensureReadable(colors.primary || "#B8860B", background, 3);

  return (
    <section
      className="px-4 pb-14 pt-8 md:px-10 md:py-16 lg:px-16"
      style={{ backgroundColor: background, color: textColor }}
      aria-label="Featured gallery video"
    >
      <AnimateSection>
        <div className="mx-auto max-w-6xl space-y-6 md:space-y-8">
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] md:mb-3" style={{ color: accent }}>
              Watch
            </p>
            <h2 className="max-w-3xl text-3xl font-black leading-none tracking-[-0.04em] md:text-5xl">
              {title}
            </h2>
          </div>
          <div className="relative overflow-hidden rounded-[2rem] border shadow-2xl" style={{ borderColor: `${accent}55` }}>
            <video
              src={src}
              autoPlay
              loop
              muted
              playsInline
              aria-label={title}
              className="aspect-video w-full object-cover"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
          </div>
        </div>
      </AnimateSection>
    </section>
  );
}
