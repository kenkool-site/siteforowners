"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { isEmbeddableBookingUrl } from "../TemplateBooking";

interface ClassicHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  heroVideo?: string;
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
  heroVideo,
  logo,
  colors,
  bookingUrl,
  phone,
}: ClassicHeroProps) {
  const isInternal = !bookingUrl || isEmbeddableBookingUrl(bookingUrl);
  const ctaHref = bookingUrl
    ? (isEmbeddableBookingUrl(bookingUrl) ? "#booking" : bookingUrl)
    : "#booking";

  const hasMedia = Boolean(heroImage || heroVideo);
  // With hero media, text is on dark overlay → force white
  const textColor = hasMedia ? "#FFFFFF" : ensureReadable(colors.background, colors.foreground);
  const accentColor = hasMedia ? ensureReadable(colors.primary, "#333333", 3) : ensureReadable(colors.primary, colors.foreground, 3);
  const btnTextColor = ensureReadable(colors.background, colors.primary, 3);

  // React's `muted` JSX attribute doesn't always reach the DOM before iOS
  // evaluates autoplay, so iOS sees the video as "has audio" and refuses to
  // start it — the poster image stays. Force-set muted via a ref and try
  // to play() once the element is mounted. Same fix lives in BoldHero/WarmHero.
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !heroVideo) return;
    el.muted = true;
    const tryPlay = () => {
      el.play().catch(() => {
        // Autoplay still refused (low-power mode, etc.); the poster persists.
      });
    };
    tryPlay();
    // Some iOS versions need a second attempt after the first user gesture.
    const onFirstTouch = () => tryPlay();
    document.addEventListener("touchstart", onFirstTouch, { once: true, passive: true });
    return () => document.removeEventListener("touchstart", onFirstTouch);
  }, [heroVideo]);

  return (
    <section
      className="relative flex min-h-[90vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center"
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
          className="mb-6 text-base font-semibold uppercase tracking-[0.3em] md:text-xl"
          style={{ color: accentColor }}
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
          {phone && (
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
