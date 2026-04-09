"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface WarmHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function WarmHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  logo,
  colors,
  bookingUrl,
  phone,
}: WarmHeroProps) {
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = canEmbed ? "#booking" : bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section className="min-h-[90vh] md:grid md:grid-cols-2">
      {/* Left: Image/Logo area */}
      <motion.div
        className="relative flex h-[40vh] items-center justify-center overflow-hidden md:h-auto"
        style={{ backgroundColor: colors.muted }}
        initial={{ opacity: 0, x: -60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        {heroImage ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center"
              style={{ backgroundImage: `url(${heroImage})` }}
            />
            <div
              className="absolute inset-0"
              style={{ backgroundColor: `${colors.foreground}40` }}
            />
          </>
        ) : null}
        {logo && (
          <div className="relative z-10">
            <div
              className="h-28 w-28 overflow-hidden rounded-full border-4 shadow-2xl md:h-36 md:w-36"
              style={{ borderColor: colors.background }}
            >
              <Image
                src={logo}
                alt={`${businessName} logo`}
                width={144}
                height={144}
                className="h-full w-full object-cover"
                unoptimized
              />
            </div>
          </div>
        )}
      </motion.div>

      {/* Accent bar — desktop only */}
      <div
        className="hidden h-auto w-1 md:block"
        style={{ background: `linear-gradient(to bottom, ${colors.primary}, ${colors.accent})` }}
      />

      {/* Right: Text + CTA */}
      <motion.div
        className="flex flex-col justify-center px-8 py-16 md:px-16 md:py-24"
        style={{ backgroundColor: colors.background }}
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <p
          className="mb-4 text-sm font-medium uppercase tracking-[0.2em]"
          style={{ color: colors.primary }}
        >
          {businessName}
        </p>
        <h1
          className="mb-6 text-4xl font-semibold leading-[1.15] md:text-6xl"
          style={{ color: colors.foreground }}
        >
          {headline}
        </h1>
        <p
          className="mb-10 max-w-md text-lg opacity-70"
          style={{ color: colors.foreground }}
        >
          {subheadline}
        </p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <Button
            size="lg"
            className="rounded-full px-10 py-7 text-base font-semibold shadow-lg transition-all hover:-translate-y-0.5"
            style={{ backgroundColor: colors.primary, color: colors.background }}
            asChild={!!ctaHref}
          >
            {ctaHref ? (
              <a href={ctaHref} target={canEmbed ? undefined : (bookingUrl ? "_blank" : undefined)} rel={canEmbed ? undefined : (bookingUrl ? "noopener noreferrer" : undefined)}>
                Come Visit Us
              </a>
            ) : (
              <span>Come Visit Us</span>
            )}
          </Button>
          {phone && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-7 text-base font-semibold"
              style={{ borderColor: colors.primary, color: colors.primary }}
              asChild
            >
              <a href={`tel:${phone}`}>Call Us</a>
            </Button>
          )}
        </div>
      </motion.div>
    </section>
  );
}
