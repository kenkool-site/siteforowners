"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface ClassicHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function ClassicHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  logo,
  colors,
  bookingUrl,
  phone,
}: ClassicHeroProps) {
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = canEmbed ? "#booking" : bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{ backgroundColor: colors.foreground, color: colors.background }}
    >
      {heroImage && (
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
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

      {logo && (
        <motion.div
          className="relative z-10 mb-6"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
        >
          <div
            className="mx-auto h-24 w-24 overflow-hidden rounded-full border-2 shadow-lg md:h-32 md:w-32"
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
        </motion.div>
      )}

      {!logo && (
        <motion.div
          className="relative z-10 mb-8"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <div className="mx-auto h-0.5 w-16" style={{ backgroundColor: colors.primary }} />
        </motion.div>
      )}

      <div className="relative z-10 max-w-3xl">
        <motion.p
          className="mb-6 text-sm font-semibold uppercase tracking-[0.3em]"
          style={{ color: colors.primary }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
        >
          {businessName}
        </motion.p>
        <motion.h1
          className="mb-8 text-5xl font-bold leading-[1.1] md:text-7xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {headline}
        </motion.h1>
        <motion.p
          className="mx-auto mb-12 max-w-xl text-lg opacity-80 md:text-xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {subheadline}
        </motion.p>
        <motion.div
          className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
        >
          <Button
            size="lg"
            className="rounded-full px-12 py-7 text-base font-semibold tracking-wide shadow-lg transition-all hover:shadow-xl hover:-translate-y-0.5"
            style={{ backgroundColor: colors.primary, color: colors.background }}
            asChild={!!ctaHref}
          >
            {ctaHref ? (
              <a href={ctaHref} target={canEmbed ? undefined : (bookingUrl ? "_blank" : undefined)} rel={canEmbed ? undefined : (bookingUrl ? "noopener noreferrer" : undefined)}>
                Book Now
              </a>
            ) : (
              <span>Book Now</span>
            )}
          </Button>
          {phone && bookingUrl && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-2 !bg-white/10 px-10 py-7 text-base font-semibold text-white backdrop-blur-sm"
              style={{ borderColor: "rgba(255,255,255,0.5)" }}
              asChild
            >
              <a href={`tel:${phone}`}>Call Us</a>
            </Button>
          )}
        </motion.div>
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 h-32"
        style={{ background: `linear-gradient(to top, ${colors.background}, transparent)` }}
      />
    </section>
  );
}
