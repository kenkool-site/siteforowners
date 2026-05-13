"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface RunwayGalleryProps {
  images: string[];
  colors: ThemeColors;
}

const TILE_CLASSES = [
  "md:row-span-2 md:min-h-[34rem]",
  "md:min-h-[16rem]",
  "md:row-span-2 md:min-h-[34rem]",
  "md:min-h-[16rem]",
  "md:col-span-2 md:min-h-[20rem]",
  "md:min-h-[20rem]",
];

/** Mobile carousel: time between auto-advances (ms) */
const MOBILE_AUTO_INTERVAL_MS = 4500;
/** After the visitor swipes or taps controls, resume auto-advance after this quiet period */
const MOBILE_AUTO_RESUME_MS = 9000;

export function RunwayGallery({ images, colors }: RunwayGalleryProps) {
  const galleryImages = images;
  const gold = ensureReadable(colors.primary || "#D8B255", "#050505", 3);
  const ctaText = ensureReadable("#050505", gold);
  const mobileScrollRef = useRef<HTMLDivElement>(null);
  const [activeMobileIndex, setActiveMobileIndex] = useState(0);
  const activeMobileIndexRef = useRef(0);
  const isProgrammaticScrollRef = useRef(false);
  const ignoreScrollPauseUntilRef = useRef(0);
  const userPausedAutoRef = useRef(false);
  const resumeAutoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduceMotionRef = useRef(false);

  const markUserControlsGallery = useCallback(() => {
    userPausedAutoRef.current = true;
    if (resumeAutoTimeoutRef.current) clearTimeout(resumeAutoTimeoutRef.current);
    resumeAutoTimeoutRef.current = setTimeout(() => {
      userPausedAutoRef.current = false;
      resumeAutoTimeoutRef.current = null;
    }, MOBILE_AUTO_RESUME_MS);
  }, []);

  useEffect(() => {
    activeMobileIndexRef.current = activeMobileIndex;
  }, [activeMobileIndex]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduceMotionRef.current = mq.matches;
    const onChange = () => {
      reduceMotionRef.current = mq.matches;
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeAutoTimeoutRef.current) clearTimeout(resumeAutoTimeoutRef.current);
    };
  }, []);

  const scrollToMobileSlide = useCallback(
    (index: number, options?: { programmatic?: boolean }) => {
      const n = galleryImages.length;
      if (n === 0) return;
      const i = ((index % n) + n) % n;

      if (!options?.programmatic) {
        markUserControlsGallery();
      }

      const root = mobileScrollRef.current;
      if (!root) return;
      const slide = root.querySelector<HTMLElement>(`[data-gallery-slide="${i}"]`);
      const smooth = !reduceMotionRef.current;

      if (options?.programmatic) {
        isProgrammaticScrollRef.current = true;
        ignoreScrollPauseUntilRef.current = Date.now() + (smooth ? 1200 : 80);
        slide?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", inline: "center", block: "nearest" });
        window.setTimeout(
          () => {
            isProgrammaticScrollRef.current = false;
          },
          smooth ? 850 : 0,
        );
      } else {
        slide?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", inline: "center", block: "nearest" });
      }
    },
    [galleryImages.length, markUserControlsGallery],
  );

  useEffect(() => {
    if (galleryImages.length <= 1) return;

    const id = window.setInterval(() => {
      if (reduceMotionRef.current) return;
      if (userPausedAutoRef.current) return;
      const n = galleryImages.length;
      const next = (activeMobileIndexRef.current + 1) % n;
      scrollToMobileSlide(next, { programmatic: true });
    }, MOBILE_AUTO_INTERVAL_MS);

    return () => clearInterval(id);
  }, [galleryImages.length, scrollToMobileSlide]);

  useEffect(() => {
    const root = mobileScrollRef.current;
    if (!root || galleryImages.length === 0) return;

    const slides = root.querySelectorAll<HTMLElement>("[data-gallery-slide]");
    const observer = new IntersectionObserver(
      (entries) => {
        let bestRatio = 0;
        let bestIndex = 0;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(entry.target.getAttribute("data-gallery-slide"));
          if (Number.isNaN(idx)) continue;
          if (entry.intersectionRatio > bestRatio) {
            bestRatio = entry.intersectionRatio;
            bestIndex = idx;
          }
        }
        if (bestRatio > 0) setActiveMobileIndex(bestIndex);
      },
      { root, rootMargin: "-12% 0px -12% 0px", threshold: [0.35, 0.55, 0.75] },
    );

    const onScroll = () => {
      if (isProgrammaticScrollRef.current) return;
      if (Date.now() < ignoreScrollPauseUntilRef.current) return;
      markUserControlsGallery();
    };

    slides.forEach((slide) => observer.observe(slide));
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", onScroll);
    };
  }, [galleryImages.length, markUserControlsGallery]);

  if (galleryImages.length === 0) return null;

  return (
    <section
      id="gallery"
      className="relative isolate overflow-hidden border-t border-white/10 px-6 py-24 text-white md:px-10 lg:px-16"
      style={{
        background:
          "radial-gradient(circle at 10% 10%, rgba(216,178,85,0.16), transparent 28rem), radial-gradient(circle at 86% 42%, rgba(216,178,85,0.12), transparent 24rem), #050505",
      }}
    >
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" aria-hidden />
      <div className="relative z-10 mx-auto max-w-7xl">
        <AnimateSection>
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <h2 className="max-w-4xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.05em] sm:text-5xl md:text-6xl lg:text-7xl">
              Gallery After The Chair
            </h2>
            <p className="max-w-sm text-sm leading-7 text-white/[0.62] md:text-base">
              A dramatic bento gallery for polished texture, sharp silhouettes, and finished looks built
              for close inspection.
            </p>
          </div>
        </AnimateSection>

        {/* Mobile: horizontal snap strip — avoids a long vertical stack of tall tiles */}
        <div className="md:hidden">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-white/45">
            Auto-plays • swipe or arrows to take control
          </p>
          <div
            ref={mobileScrollRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 pl-1 pr-6 pt-1 [-webkit-overflow-scrolling:touch]"
            style={{ scrollbarGutter: "stable" }}
            role="region"
            aria-roledescription="carousel"
            aria-label="Gallery images. Automatically advances; swipe sideways or use arrows to browse."
            tabIndex={0}
            onPointerDown={markUserControlsGallery}
          >
            {galleryImages.map((src, index) => (
              <div
                key={`m-${src}-${index}`}
                data-gallery-slide={index}
                className={`group relative aspect-[3/4] w-[82vw] max-w-sm shrink-0 snap-center snap-always overflow-hidden border bg-[#0D0B08] shadow-2xl first:ml-[calc(0.5rem-env(safe-area-inset-left,0px))] last:mr-[calc(0.5rem-env(safe-area-inset-right,0px))]`}
              >
                <div
                  className="absolute inset-0 z-10 border opacity-70"
                  style={{ borderColor: `${gold}42` }}
                  aria-hidden
                />
                <Image
                  src={src}
                  alt={`Editorial gallery image ${index + 1}`}
                  fill
                  className="object-cover brightness-75 contrast-110 saturate-90"
                  sizes="82vw"
                  unoptimized
                />
                <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-white/10" />
                <div className="absolute bottom-4 left-4 z-20 text-[0.65rem] font-black uppercase tracking-[0.34em] text-white/70">
                  Look {String(index + 1).padStart(2, "0")}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex max-w-md flex-col items-stretch gap-4 self-center">
            <div className="flex items-center justify-between gap-3 px-1">
              <button
                type="button"
                aria-label="Previous gallery image"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 text-xl text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                disabled={galleryImages.length <= 1}
                onClick={() => scrollToMobileSlide(activeMobileIndex - 1)}
              >
                ‹
              </button>
              <p className="min-w-[5.5rem] text-center text-[0.68rem] font-bold uppercase tracking-[0.28em] text-white/50">
                {String(activeMobileIndex + 1).padStart(2, "0")} / {String(galleryImages.length).padStart(2, "0")}
              </p>
              <button
                type="button"
                aria-label="Next gallery image"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 text-xl text-white/90 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-25"
                disabled={galleryImages.length <= 1}
                onClick={() => scrollToMobileSlide(activeMobileIndex + 1)}
              >
                ›
              </button>
            </div>
            <div
              className="h-1 w-full overflow-hidden rounded-full bg-white/12"
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={galleryImages.length}
              aria-valuenow={activeMobileIndex + 1}
              aria-label="Gallery progress"
            >
              <div
                className="h-full rounded-full transition-[width] duration-300 ease-out"
                style={{
                  width: `${((activeMobileIndex + 1) / galleryImages.length) * 100}%`,
                  backgroundColor: gold,
                }}
              />
            </div>
          </div>
        </div>

        <div className="hidden md:grid md:auto-rows-[16rem] md:grid-cols-3 md:gap-4">
          {galleryImages.map((src, index) => (
            <AnimateSection
              key={`${src}-${index}`}
              animation="scale-in"
              delay={index * 0.08}
              className={`group relative min-h-[16rem] overflow-hidden border bg-[#0D0B08] shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_48px_rgba(216,178,85,0.18)] ${TILE_CLASSES[index % TILE_CLASSES.length]}`}
            >
              <div
                className="absolute inset-0 z-10 border opacity-70 transition-opacity duration-300 group-hover:opacity-100"
                style={{ borderColor: `${gold}42` }}
                aria-hidden
              />
              <Image
                src={src}
                alt={`Editorial hair gallery image ${index + 1}`}
                fill
                className="object-cover brightness-75 contrast-110 saturate-90 transition duration-700 group-hover:scale-110 group-hover:brightness-95 group-hover:saturate-105"
                sizes="33vw"
                unoptimized
              />
              <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-white/10 transition-opacity duration-300 group-hover:opacity-75" />
              <div className="absolute bottom-5 left-5 z-20 text-[0.65rem] font-black uppercase tracking-[0.34em] text-white/70">
                Look {String(index + 1).padStart(2, "0")}
              </div>
            </AnimateSection>
          ))}
        </div>

        <AnimateSection>
          <div
            className="mt-8 flex flex-col gap-5 border p-5 md:flex-row md:items-center md:justify-between"
            style={{ borderColor: `${gold}36`, backgroundColor: "rgba(255,255,255,0.035)" }}
          >
            <p className="max-w-2xl text-sm font-semibold uppercase tracking-[0.22em] text-white/70">
              See a finish you like? Start with the look, then pick the service.
            </p>
            <a
              href="#booking"
              className="inline-flex min-h-12 items-center justify-center border px-6 text-[0.68rem] font-black uppercase tracking-[0.24em] transition-all hover:-translate-y-0.5"
              style={{ backgroundColor: gold, borderColor: gold, color: ctaText }}
            >
              Book a Look
            </a>
          </div>
        </AnimateSection>
      </div>
    </section>
  );
}
