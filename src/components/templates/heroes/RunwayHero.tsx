"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";

interface RunwayHeroProps {
  businessName: string;
  headline: string;
  subheadline: string;
  heroImage?: string;
  heroVideo?: string;
  colors: ThemeColors;
  rating?: number;
  reviewCount?: number;
  hasBooking?: boolean;
  hasGallery?: boolean;
}

function splitHeadline(headline: string): [string, string] {
  const words = headline.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 2) {
    return [headline, "Elevated"];
  }

  const splitAt = Math.ceil(words.length / 2);
  return [words.slice(0, splitAt).join(" "), words.slice(splitAt).join(" ")];
}

export function RunwayHero({
  businessName,
  headline,
  subheadline,
  heroImage,
  heroVideo,
  colors,
  rating,
  reviewCount,
  hasBooking = false,
  hasGallery = false,
}: RunwayHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runwayBackground = "#030303";
  const [headlineTop, headlineGold] = splitHeadline(headline);
  const showProof = rating !== undefined || reviewCount !== undefined;
  const gold = ensureReadable(colors.primary || "#D8B15A", runwayBackground, 3);
  const primaryCtaText = ensureReadable("#0A0A0A", gold);

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
      className="relative isolate min-h-[92vh] overflow-hidden bg-black px-6 py-24 text-white md:px-10 lg:px-16"
      style={{
        background:
          "radial-gradient(circle at 68% 18%, rgba(216,177,90,0.24), transparent 28%), radial-gradient(circle at 18% 82%, rgba(255,255,255,0.08), transparent 24%), #030303",
      }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0,transparent_30%,transparent_70%,rgba(255,255,255,0.06)_100%)]" />
      {heroImage && (
        <div className="absolute inset-y-0 right-0 w-full opacity-35 lg:w-[58%] lg:opacity-45" aria-hidden>
          <Image
            src={heroImage}
            alt=""
            fill
            className="object-cover object-center brightness-75 contrast-125 saturate-90"
            sizes="(max-width: 1024px) 100vw, 58vw"
            priority
            unoptimized
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#030303] via-[#030303]/65 to-[#030303]/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#030303] via-transparent to-[#030303]/20" />
        </div>
      )}
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" />

      <div className="relative z-10 mx-auto grid min-h-[calc(92vh-12rem)] max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(320px,0.75fr)]">
        <motion.div
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: "easeOut" }}
        >
          <p
            className="mb-6 text-xs font-semibold uppercase tracking-[0.45em] text-white/60 md:text-sm"
            style={{ color: `${gold}CC` }}
          >
            {businessName}
          </p>

          <h1 className="max-w-3xl text-5xl font-black uppercase leading-[0.88] tracking-[-0.06em] sm:text-6xl md:text-7xl xl:text-8xl">
            <span className="block">{headlineTop}</span>
            <span
              className="block"
              style={{
                color: gold,
                textShadow: `0 0 24px ${gold}55, 0 0 64px ${gold}33`,
              }}
            >
              {headlineGold}
            </span>
          </h1>

          <motion.p
            className="mt-8 max-w-xl text-base leading-8 text-white/70 md:text-lg"
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.18, ease: "easeOut" }}
          >
            {subheadline}
          </motion.p>

          {(hasBooking || hasGallery) && (
            <motion.div
              className="mt-10 flex flex-col gap-4 sm:flex-row"
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.3, ease: "easeOut" }}
            >
              {hasBooking && (
                <Button
                  size="lg"
                  className="rounded-none border border-white/10 px-10 py-7 text-xs font-bold uppercase tracking-[0.28em] shadow-[0_0_40px_rgba(216,177,90,0.25)] transition-all hover:-translate-y-0.5"
                  style={{ backgroundColor: gold, color: primaryCtaText }}
                  asChild
                >
                  <a href="#booking">
                    Book the Look
                  </a>
                </Button>
              )}
              {hasGallery && (
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-none border-white/25 !bg-white/5 px-10 py-7 text-xs font-bold uppercase tracking-[0.28em] text-white backdrop-blur transition-all hover:-translate-y-0.5 hover:!bg-white/10"
                  asChild
                >
                  <a href="#gallery">View Gallery</a>
                </Button>
              )}
            </motion.div>
          )}
        </motion.div>

        <motion.div
          className="relative mx-auto w-full max-w-md lg:mx-0 lg:ml-auto"
          initial={{ opacity: 0, x: 42, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={{ duration: 0.85, delay: 0.12, ease: "easeOut" }}
        >
          <div
            className="absolute -inset-4 border border-white/10"
            style={{ boxShadow: `0 0 80px ${gold}22` }}
          />
          <div className="relative aspect-[4/5] overflow-hidden border border-white/20 bg-white/5 p-3 shadow-2xl backdrop-blur">
            <div className="relative h-full overflow-hidden bg-neutral-950">
              {heroVideo ? (
                <video
                  ref={videoRef}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  poster={heroImage}
                  className="h-full w-full object-cover"
                  src={heroVideo}
                />
              ) : heroImage ? (
                <Image
                  src={heroImage}
                  alt=""
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 46vw"
                  priority
                  unoptimized
                />
              ) : (
                <div
                  className="h-full w-full"
                  style={{
                    background: `linear-gradient(145deg, #090909, ${gold}55 48%, #111111)`,
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-white/10" />
            </div>
          </div>

          {showProof && (
            <motion.div
              className="absolute -bottom-8 left-6 border border-white/15 bg-black/70 px-6 py-5 shadow-2xl backdrop-blur-md sm:left-10"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.6, ease: "easeOut" }}
            >
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] text-white/45">
                Client Proof
              </p>
              <div className="mt-2 flex items-end gap-3">
                {rating !== undefined && (
                  <span className="text-4xl font-black leading-none" style={{ color: gold }}>
                    {rating.toFixed(1)}
                  </span>
                )}
                {reviewCount !== undefined && (
                  <span className="pb-1 text-sm font-semibold uppercase tracking-[0.18em] text-white/70">
                    {reviewCount} Reviews
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
}
