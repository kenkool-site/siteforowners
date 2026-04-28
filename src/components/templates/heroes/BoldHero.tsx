"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors, ensureReadable } from "@/lib/templates/contrast";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface BoldHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  heroVideo?: string;
  colors: ThemeColors;
  bookingUrl?: string;
  phone?: string;
}

export function BoldHero({
  businessName,
  headline,
  heroImage,
  heroVideo,
  colors,
  bookingUrl,
}: BoldHeroProps) {
  const isInternal = !bookingUrl || isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = bookingUrl
    ? (isEmbeddableBookingUrl(bookingUrl) ? "#booking" : bookingUrl)
    : "#booking";

  // Dynamic contrast: pick readable colors based on actual background
  const rc = readableColors(colors);
  const hasMedia = Boolean(heroImage || heroVideo);
  // With hero media, text is always on dark overlay → force white
  const textColor = hasMedia ? "#FFFFFF" : rc.textOnFg;
  const accentColor = hasMedia ? ensureReadable(colors.primary, "#333333", 3) : rc.primaryOnFg;
  const btnTextColor = ensureReadable(colors.background, colors.primary, 3);

  // iOS autoplay reliability — see ClassicHero for the rationale.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !heroVideo) return;
    el.muted = true;
    const tryPlay = () => {
      el.play().catch(() => {});
    };
    tryPlay();
    const onFirstTouch = () => tryPlay();
    document.addEventListener("touchstart", onFirstTouch, { once: true, passive: true });
    return () => document.removeEventListener("touchstart", onFirstTouch);
  }, [heroVideo]);

  return (
    <section
      className="relative flex min-h-[100vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
      style={{ backgroundColor: colors.foreground, color: textColor }}
    >
      {hasMedia && (
        <>
          {heroVideo ? (
            <video
              ref={videoRef}
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              poster={heroImage}
              className="absolute inset-0 h-full w-full object-cover"
              src={heroVideo}
            />
          ) : (
            <Image
              src={heroImage!}
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
              priority
              unoptimized
            />
          )}
          <div className="absolute inset-0 bg-black/60" />
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
        <motion.p
          className="mb-4 text-base font-semibold uppercase tracking-[0.25em] md:text-xl"
          style={{ color: accentColor }}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {businessName}
        </motion.p>
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
            style={{ backgroundColor: colors.primary, color: btnTextColor }}
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
        </motion.div>
      </div>
    </section>
  );
}
