"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { readableTextColor, ensureReadable } from "@/lib/templates/contrast";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface VibrantHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function VibrantHero({
  businessName,
  headline,
  subheadline,
  logo,
  colors,
  bookingUrl,
  phone,
}: VibrantHeroProps) {
  const isInternal = !bookingUrl || isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = bookingUrl
    ? (isEmbeddableBookingUrl(bookingUrl) ? "#booking" : bookingUrl)
    : "#booking";

  // Dynamic: pick white or dark text based on primary color luminance
  const textColor = readableTextColor(colors.primary);
  const btnTextColor = ensureReadable(colors.primary, "#FFFFFF", 3);

  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{
        background: `linear-gradient(135deg, ${colors.primary}, ${colors.accent})`,
        color: textColor,
      }}
    >
      {/* Decorative blurred circles */}
      <div
        className="absolute -left-20 -top-20 h-72 w-72 rounded-full opacity-30 blur-3xl"
        style={{ backgroundColor: colors.secondary }}
      />
      <div
        className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ backgroundColor: colors.accent }}
      />

      {logo && (
        <motion.div
          className="relative z-10 mb-8"
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.1 }}
        >
          <div className="mx-auto h-24 w-24 overflow-hidden rounded-2xl bg-white/90 p-2 shadow-xl md:h-28 md:w-28">
            <Image
              src={logo}
              alt={`${businessName} logo`}
              width={112}
              height={112}
              className="h-full w-full rounded-xl object-cover"
              unoptimized
            />
          </div>
        </motion.div>
      )}

      <motion.p
        className="relative z-10 mb-4 text-base font-semibold uppercase tracking-[0.2em] opacity-80 md:text-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.8 }}
        transition={{ duration: 0.5 }}
      >
        {businessName}
      </motion.p>

      <motion.h1
        className="relative z-10 mb-6 max-w-3xl text-5xl font-bold leading-[1.1] md:text-7xl"
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 100, damping: 12, delay: 0.2 }}
      >
        {headline}
      </motion.h1>

      <motion.p
        className="relative z-10 mb-12 max-w-xl text-lg opacity-90 md:text-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 0.9, y: 0 }}
        transition={{ duration: 0.5, delay: 0.4 }}
      >
        {subheadline}
      </motion.p>

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 sm:flex-row"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 150, damping: 12, delay: 0.5 }}
      >
        <Button
          size="lg"
          className="rounded-full bg-white px-12 py-7 text-base font-bold shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl"
          style={{ color: btnTextColor }}
          asChild={!!ctaHref}
        >
          {ctaHref ? (
            <a href={ctaHref} target={isInternal ? undefined : "_blank"} rel={isInternal ? undefined : "noopener noreferrer"}>
              Book Now
            </a>
          ) : (
            <span>Book Now</span>
          )}
        </Button>
        {phone && (
          <Button
            size="lg"
            variant="outline"
            className="rounded-full border-2 !bg-transparent px-10 py-7 text-base font-semibold hover:!bg-white/10"
            style={{ borderColor: `${textColor}66`, color: textColor }}
            asChild
          >
            <a href={`tel:${phone}`}>Call Us</a>
          </Button>
        )}
      </motion.div>
    </section>
  );
}
