"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";

interface GrandHeroProps {
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

export function GrandHero({
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
}: GrandHeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const runwayBackdrop = "#030303";
  const [headlineTop, headlineGold] = splitHeadline(headline);
  const hasMedia = Boolean(heroImage || heroVideo);
  const hasRating = typeof rating === "number" && Number.isFinite(rating);
  const hasReviewCount = typeof reviewCount === "number" && Number.isFinite(reviewCount);
  const showProof = hasRating || hasReviewCount;
  const gold = ensureReadable(colors.primary || "#D8B15A", runwayBackdrop, 3);
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
      className="relative flex min-h-[92vh] flex-col items-center justify-center overflow-hidden px-6 py-24 text-center text-white"
      style={{ backgroundColor: hasMedia ? colors.foreground : runwayBackdrop }}
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
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 22%, rgba(216,177,90,0.14), transparent 42%), radial-gradient(ellipse at 50% 100%, rgba(0,0,0,0.55), transparent 50%)",
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.14]"
            style={{
              background: `linear-gradient(135deg, transparent 40%, ${gold}40 40%, ${gold}40 60%, transparent 60%)`,
            }}
          />
        </>
      )}

      {!hasMedia && (
        <>
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 68% 18%, rgba(216,177,90,0.24), transparent 28%), radial-gradient(circle at 18% 82%, rgba(255,255,255,0.08), transparent 24%), #030303",
            }}
          />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.08)_0,transparent_30%,transparent_70%,rgba(255,255,255,0.06)_100%)]" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-white/10" />
        </>
      )}

      <div className="relative z-10 mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.75, ease: "easeOut" }}
        >
          <div className="mb-7">
            <p className="mb-2 text-[0.62rem] font-black uppercase tracking-[0.42em] text-white/45">
              Now presenting
            </p>
            <p
              className="text-xl font-black uppercase leading-none tracking-[0.28em] md:text-2xl xl:text-3xl"
              style={{ color: `${gold}E6`, textShadow: `0 0 34px ${gold}33` }}
            >
              {businessName}
            </p>
          </div>

          <h1 className="text-4xl font-black uppercase leading-[0.92] tracking-[-0.05em] sm:text-5xl md:text-6xl lg:text-7xl">
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
            className="mx-auto mt-8 max-w-xl text-base leading-8 text-white/75 md:text-lg"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.15, ease: "easeOut" }}
          >
            {subheadline}
          </motion.p>

          {(hasBooking || hasGallery) && (
            <motion.div
              className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.28, ease: "easeOut" }}
            >
              {hasBooking && (
                <Button
                  size="lg"
                  className="rounded-none border border-white/10 px-10 py-7 text-xs font-bold uppercase tracking-[0.28em] shadow-[0_0_40px_rgba(216,177,90,0.25)] transition-all hover:-translate-y-0.5"
                  style={{ backgroundColor: gold, color: primaryCtaText }}
                  asChild
                >
                  <a href="#booking">Book the Look</a>
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

          {showProof && (
            <motion.div
              className="mx-auto mt-12 max-w-md border border-white/15 bg-black/65 px-6 py-5 shadow-2xl backdrop-blur-md"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.45, ease: "easeOut" }}
            >
              <p className="text-[0.65rem] font-bold uppercase tracking-[0.35em] text-white/45">
                Client Proof
              </p>
              <div className="mt-2 flex items-end justify-center gap-3">
                {hasRating && (
                  <span className="text-4xl font-black leading-none" style={{ color: gold }}>
                    {rating!.toFixed(1)}
                  </span>
                )}
                {hasReviewCount && (
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
