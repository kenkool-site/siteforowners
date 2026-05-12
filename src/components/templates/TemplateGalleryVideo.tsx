"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { AnimateSection } from "./shared/AnimateSection";

type TemplateName = "classic" | "bold" | "elegant" | "vibrant" | "warm" | "runway" | "grand";

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
  grand: "Grand In Motion",
};

export function TemplateGalleryVideo({ src, galleryVideoTitle, colors, template }: TemplateGalleryVideoProps) {
  const isEditorialDark = template === "runway" || template === "grand";
  const title = galleryVideoTitle?.trim() || defaultTitles[template];
  const background = isEditorialDark ? "#050505" : colors.background;
  const textColor = ensureReadable(isEditorialDark ? "#FFFFFF" : colors.foreground, background, 4.5);
  const accent = ensureReadable(colors.primary || "#B8860B", background, 3);

  return (
    <section
      className="px-2 pb-14 pt-7 md:px-10 md:py-16 lg:px-16"
      style={{ backgroundColor: background, color: textColor }}
      aria-label="Featured gallery video"
    >
      <AnimateSection>
        <div className="mx-auto max-w-[92rem] space-y-5 md:space-y-8">
          <div className="px-4 md:px-0">
            <p className="mb-2 text-xs font-black uppercase tracking-[0.28em] md:mb-3" style={{ color: accent }}>
              Watch
            </p>
            <h2 className="max-w-3xl text-3xl font-black leading-none tracking-[-0.04em] md:text-5xl">
              {title}
            </h2>
          </div>
          <div className="relative overflow-hidden rounded-none border shadow-2xl" style={{ borderColor: `${accent}55` }}>
            <video
              src={src}
              autoPlay
              loop
              muted
              playsInline
              aria-label={title}
              className="aspect-[4/5] min-h-[28rem] w-full object-cover sm:aspect-[3/4] md:aspect-video md:min-h-0"
            />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/45 to-transparent" />
          </div>
        </div>
      </AnimateSection>
    </section>
  );
}
