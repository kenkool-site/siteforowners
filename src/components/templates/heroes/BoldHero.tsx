"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface BoldHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function BoldHero({
  headline,
  heroImage,
  colors,
  bookingUrl,
  phone,
}: BoldHeroProps) {
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = canEmbed ? "#booking" : bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="relative flex min-h-[100vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{ backgroundColor: colors.foreground, color: colors.background }}
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
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(135deg, ${colors.foreground}EE, ${colors.primary}66, ${colors.foreground}DD)`,
            }}
          />
        </>
      )}

      {/* Diagonal accent overlay */}
      <div
        className="absolute inset-0 opacity-20"
        style={{
          background: `linear-gradient(135deg, transparent 40%, ${colors.primary}40 40%, ${colors.primary}40 60%, transparent 60%)`,
        }}
      />

      <div className="relative z-10 max-w-4xl">
        <motion.h1
          className="mb-10 text-6xl font-black leading-[0.95] tracking-tight md:text-8xl"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          {headline}
        </motion.h1>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <Button
            size="lg"
            className="rounded-full px-14 py-8 text-lg font-bold uppercase tracking-wider shadow-2xl transition-all hover:shadow-xl hover:-translate-y-1"
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
        </motion.div>
      </div>
    </section>
  );
}
