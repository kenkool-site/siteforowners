"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  logo?: string;
  colors: ThemeColors;
  ctaText?: string;
  bookingUrl?: string;
  phone?: string;
}

export function TemplateHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  logo,
  colors,
  ctaText = "Book Now",
  bookingUrl,
  phone,
}: TemplateHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{
        backgroundColor: colors.foreground,
        color: colors.background,
      }}
    >
      {/* Background image with overlay — only use actual photos, not logos */}
      {heroImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-700"
            style={{ backgroundImage: `url(${heroImage})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(to bottom, ${colors.foreground}CC, ${colors.foreground}99, ${colors.foreground}DD)`,
            }}
          />
        </>
      )}

      {/* Logo — rendered cleanly as an element, not stretched as background */}
      {logo && (
        <div className="relative z-10 mb-6">
          <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-2 shadow-lg md:h-32 md:w-32"
            style={{ borderColor: `${colors.primary}40` }}
          >
            <Image
              src={logo}
              alt={`${businessName} logo`}
              width={128}
              height={128}
              className="h-full w-full object-cover"
              unoptimized
            />
          </div>
        </div>
      )}

      {/* Decorative accent line (only if no logo) */}
      {!logo && (
        <div className="relative z-10 mb-8">
          <div
            className="mx-auto h-0.5 w-16"
            style={{ backgroundColor: colors.primary }}
          />
        </div>
      )}

      <div className="relative z-10 max-w-3xl">
        <p
          className="mb-6 text-sm font-semibold uppercase tracking-[0.3em]"
          style={{ color: colors.primary }}
        >
          {businessName}
        </p>
        <h1 className="mb-8 text-5xl font-bold leading-[1.1] md:text-7xl">
          {headline}
        </h1>
        <p className="mx-auto mb-12 max-w-xl text-lg opacity-80 md:text-xl">
          {subheadline}
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button
            size="lg"
            className="rounded-full px-12 py-7 text-base font-semibold tracking-wide shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
            style={{
              backgroundColor: colors.primary,
              color: colors.background,
            }}
            asChild={!!ctaHref}
          >
            {ctaHref ? (
              <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
                {ctaText}
              </a>
            ) : (
              <span>{ctaText}</span>
            )}
          </Button>
          {phone && bookingUrl && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-7 text-base font-semibold"
              style={{
                borderColor: `${colors.primary}80`,
                color: colors.background,
              }}
              asChild
            >
              <a href={`tel:${phone}`}>Call Us</a>
            </Button>
          )}
        </div>
      </div>

      {/* Bottom fade */}
      <div
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{
          background: `linear-gradient(to top, ${colors.background}, transparent)`,
        }}
      />
    </section>
  );
}
