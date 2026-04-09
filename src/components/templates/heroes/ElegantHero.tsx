"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface ElegantHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  logo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function ElegantHero({
  businessName,
  headline,
  subheadline,
  logo,
  colors,
  bookingUrl,
  phone,
}: ElegantHeroProps) {
  const ctaHref = bookingUrl || (phone ? `tel:${phone}` : undefined);

  return (
    <section
      className="flex min-h-[90vh] flex-col items-center justify-center px-6 py-32 text-center"
      style={{ backgroundColor: colors.background, color: colors.foreground }}
    >
      {/* Decorative line */}
      <motion.div
        className="mb-10 h-px"
        style={{ backgroundColor: colors.primary }}
        initial={{ width: 0 }}
        animate={{ width: 80 }}
        transition={{ duration: 1.2, ease: "easeOut" }}
      />

      {logo && (
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1.2, delay: 0.2 }}
        >
          <Image
            src={logo}
            alt={`${businessName} logo`}
            width={80}
            height={80}
            className="mx-auto h-20 w-20 rounded-full object-cover opacity-80"
            unoptimized
          />
        </motion.div>
      )}

      <motion.p
        className="mb-8 text-xs font-medium uppercase tracking-[0.4em]"
        style={{ color: colors.primary }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.3 }}
      >
        {businessName}
      </motion.p>

      <motion.h1
        className="mb-8 max-w-3xl text-5xl font-light leading-[1.15] md:text-7xl"
        style={{ color: colors.foreground }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.2, delay: 0.4 }}
      >
        {headline}
      </motion.h1>

      <motion.p
        className="mb-14 max-w-md text-base opacity-60"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.6 }}
        transition={{ duration: 1.2, delay: 0.6 }}
      >
        {subheadline}
      </motion.p>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.8 }}
      >
        <Button
          size="lg"
          variant="outline"
          className="rounded-none border px-12 py-7 text-xs font-medium uppercase tracking-[0.2em]"
          style={{ borderColor: colors.foreground, color: colors.foreground }}
          asChild={!!ctaHref}
        >
          {ctaHref ? (
            <a href={ctaHref} target={bookingUrl ? "_blank" : undefined} rel={bookingUrl ? "noopener noreferrer" : undefined}>
              Book an Appointment
            </a>
          ) : (
            <span>Book an Appointment</span>
          )}
        </Button>
      </motion.div>
    </section>
  );
}
