"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesGalleryProject, HomeServicesLocale } from "@/lib/home-services/types";
import { hasProjectMedia, localizedText } from "@/lib/home-services/display";
import { getHomeServicesReadable } from "./home-services-theme";
import type { HomeServicesSectionCopy } from "@/lib/home-services/types";
import { HomeServicesSectionHeading } from "./HomeServicesSectionHeading";

export interface HomeServicesGalleryProps {
  projects: HomeServicesGalleryProject[];
  /** Photo-gallery URLs shown only when no project has media. */
  fallbackImages?: string[];
  locale: HomeServicesLocale;
  colors: ThemeColors;
  copy: Required<HomeServicesSectionCopy>;
}

function GalleryImage({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl">
      <Image
        src={src}
        alt={alt}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, 50vw"
        unoptimized
      />
    </div>
  );
}

export function HomeServicesGallery({
  projects,
  fallbackImages = [],
  locale,
  colors,
  copy,
}: HomeServicesGalleryProps) {
  const t = useTranslations("homeServices");
  const readable = getHomeServicesReadable(colors);

  const visibleProjects = projects.filter(hasProjectMedia);

  if (visibleProjects.length === 0 && fallbackImages.length === 0) {
    return null;
  }

  if (visibleProjects.length === 0) {
    return (
      <section
        id="work"
        className="px-4 py-16 sm:px-6"
        style={{ backgroundColor: colors.muted }}
        aria-labelledby="work-heading"
      >
        <div className="mx-auto max-w-6xl">
          <HomeServicesSectionHeading id="work-heading" copy={copy} locale={locale} color={readable.headingOnMuted} />

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {fallbackImages.map((src, index) => (
              <GalleryImage key={`${index}-${src}`} src={src} alt={t("sections.work")} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="work"
      className="px-4 py-16 sm:px-6"
      style={{ backgroundColor: colors.muted }}
      aria-labelledby="work-heading"
    >
      <div className="mx-auto max-w-6xl">
        <HomeServicesSectionHeading id="work-heading" copy={copy} locale={locale} color={readable.headingOnMuted} />

        <div className="grid gap-6 md:grid-cols-2">
          {visibleProjects.map((project) => {
            const caption = localizedText(locale, {
              en: project.caption_en,
              es: project.caption_es,
            });
            const hasBefore = Boolean(project.before_image);
            const hasAfter = Boolean(project.after_image);
            const hasPair = hasBefore && hasAfter;
            const singleImage = project.image || project.before_image || project.after_image;

            return (
              <figure
                key={project.id}
                className="overflow-hidden rounded-2xl border p-4"
                style={{
                  backgroundColor: colors.background,
                  borderColor: `${colors.foreground}10`,
                }}
              >
                {hasPair ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p
                        className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]"
                        style={{ color: readable.labelOnBg, opacity: 0.7 }}
                      >
                        {t("gallery.before")}
                      </p>
                      <GalleryImage src={project.before_image!} alt={t("gallery.before")} />
                    </div>
                    <div>
                      <p
                        className="mb-2 text-xs font-semibold uppercase tracking-[0.14em]"
                        style={{ color: readable.labelOnBg, opacity: 0.7 }}
                      >
                        {t("gallery.after")}
                      </p>
                      <GalleryImage src={project.after_image!} alt={t("gallery.after")} />
                    </div>
                  </div>
                ) : (
                  singleImage && (
                    <GalleryImage src={singleImage} alt={caption || t("sections.work")} />
                  )
                )}

                {caption && (
                  <figcaption className="mt-4 text-sm leading-relaxed" style={{ color: readable.bodyOnBg }}>
                    {caption}
                  </figcaption>
                )}
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
