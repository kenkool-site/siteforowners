"use client";

import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  colors: ThemeColors;
  ctaText?: string;
  onCtaClick?: () => void;
}

export function TemplateHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  colors,
  ctaText = "Book Now",
  onCtaClick,
}: TemplateHeroProps) {
  return (
    <section
      className="relative flex min-h-[85vh] flex-col items-center justify-center px-6 py-20 text-center"
      style={{
        backgroundColor: colors.foreground,
        color: colors.background,
      }}
    >
      {heroImage && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-30"
          style={{ backgroundImage: `url(${heroImage})` }}
        />
      )}
      <div className="relative z-10 max-w-2xl">
        <p
          className="mb-4 text-sm font-medium uppercase tracking-[0.25em]"
          style={{ color: colors.primary }}
        >
          {businessName}
        </p>
        <h1 className="mb-6 text-4xl font-bold leading-tight md:text-6xl">
          {headline}
        </h1>
        <p className="mb-10 text-lg opacity-80 md:text-xl">{subheadline}</p>
        <Button
          size="lg"
          className="rounded-full px-10 py-6 text-base font-semibold tracking-wide"
          style={{
            backgroundColor: colors.primary,
            color: colors.background,
          }}
          onClick={onCtaClick}
        >
          {ctaText}
        </Button>
      </div>
    </section>
  );
}
