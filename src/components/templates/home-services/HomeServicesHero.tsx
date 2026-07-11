"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";

export interface HomeServicesHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  phoneHref: string | null;
  messageHref: string | null;
  estimateHref: string;
  colors: ThemeColors;
}

export function HomeServicesHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  phoneHref,
  messageHref,
  estimateHref,
  colors,
}: HomeServicesHeroProps) {
  const t = useTranslations("homeServices");
  const hasMedia = Boolean(heroImage);
  const textColor = hasMedia ? "#FFFFFF" : ensureReadable(colors.background, colors.foreground);
  const estimateTextColor = ensureReadable(colors.background, colors.secondary, 3);
  const outlineTextColor = hasMedia ? "#FFFFFF" : ensureReadable(colors.primary, colors.background, 3);

  return (
    <section
      className="relative flex min-h-[78vh] flex-col justify-end overflow-hidden px-4 pb-16 pt-28 sm:px-6 sm:pb-20 sm:pt-32"
      style={
        hasMedia
          ? { color: textColor }
          : {
              color: textColor,
              background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary} 52%, ${colors.muted} 100%)`,
            }
      }
      aria-label={businessName}
    >
      {heroImage && (
        <>
          <Image
            src={heroImage}
            alt=""
            fill
            className="object-cover"
            sizes="100vw"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/20" />
        </>
      )}

      <div className="relative z-10 mx-auto w-full max-w-6xl">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] opacity-90">
          {businessName}
        </p>
        <h1 className="max-w-3xl text-3xl font-bold leading-tight sm:text-4xl md:text-5xl">
          {headline}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed opacity-95 sm:text-lg">
          {subheadline}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <a
            href={estimateHref}
            className="inline-flex min-h-11 items-center justify-center rounded-full px-6 text-sm font-semibold shadow-sm transition-opacity hover:opacity-90"
            style={{ backgroundColor: colors.secondary, color: estimateTextColor }}
          >
            {t("actions.freeEstimate")}
          </a>
          {phoneHref && (
            <a
              href={phoneHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                borderColor: hasMedia ? "rgba(255,255,255,0.65)" : colors.primary,
                color: outlineTextColor,
                backgroundColor: hasMedia ? "rgba(0,0,0,0.18)" : colors.background,
              }}
            >
              {t("actions.call")}
            </a>
          )}
          {messageHref && (
            <a
              href={messageHref}
              className="inline-flex min-h-11 items-center justify-center rounded-full border px-6 text-sm font-semibold transition-opacity hover:opacity-90"
              style={{
                borderColor: hasMedia ? "rgba(255,255,255,0.65)" : colors.primary,
                color: outlineTextColor,
                backgroundColor: hasMedia ? "rgba(0,0,0,0.18)" : colors.background,
              }}
            >
              {t("actions.message")}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
