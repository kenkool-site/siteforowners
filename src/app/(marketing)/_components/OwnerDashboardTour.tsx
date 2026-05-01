"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useFadeUp } from "./_motion";
import { HomeSlide } from "./OwnerDashboardSlides/HomeSlide";
import { ScheduleSlide } from "./OwnerDashboardSlides/ScheduleSlide";
import { ServicesSlide } from "./OwnerDashboardSlides/ServicesSlide";
import { LeadsSlide } from "./OwnerDashboardSlides/LeadsSlide";

const SLIDE_COUNT = 4;
const ADVANCE_MS = 4000;

export function OwnerDashboardTour() {
  const fadeUp = useFadeUp();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SLIDE_COUNT);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      setIndex((i) => (i + 1) % SLIDE_COUNT);
      e.preventDefault();
    } else if (e.key === "ArrowLeft") {
      setIndex((i) => (i - 1 + SLIDE_COUNT) % SLIDE_COUNT);
      e.preventDefault();
    }
  };

  return (
    <section className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          {...fadeUp}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — What you see —
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Your shop, <em className="text-warm-accent italic">in one place.</em>
        </motion.h2>
        <motion.p
          {...fadeUp}
          transition={{ delay: 0.1 }}
          className="mt-3 text-sm text-warm-textMuted"
        >
          Bookings, services, leads, billing — all in a dashboard that uses your brand color.
        </motion.p>

        <div
          ref={stageRef}
          tabIndex={0}
          role="region"
          aria-roledescription="carousel"
          aria-label="Dashboard tour"
          onKeyDown={onKeyDown}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setPaused(false);
            }
          }}
          className="mt-8 overflow-hidden rounded-2xl"
        >
          <div
            className="flex transition-transform duration-500 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(-${index * 100}%)` }}
          >
            <div className="w-full flex-none px-1">
              <HomeSlide active={index === 0} />
            </div>
            <div className="w-full flex-none px-1">
              <ScheduleSlide />
            </div>
            <div className="w-full flex-none px-1">
              <ServicesSlide />
            </div>
            <div className="w-full flex-none px-1">
              <LeadsSlide />
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-2" role="tablist" aria-label="Dashboard tour slides">
            {[0, 1, 2, 3].map((i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-2 rounded-full transition-all ${
                  i === index ? "w-6 bg-pop-pink" : "w-2 bg-warm-cream1 hover:bg-warm-eyebrow"
                }`}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Previous slide"
              onClick={() => setIndex((i) => (i - 1 + SLIDE_COUNT) % SLIDE_COUNT)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-warm-cream1 bg-white text-warm-text hover:border-pop-pink hover:text-pop-pink"
            >
              ←
            </button>
            <button
              type="button"
              aria-label="Next slide"
              onClick={() => setIndex((i) => (i + 1) % SLIDE_COUNT)}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-warm-cream1 bg-white text-warm-text hover:border-pop-pink hover:text-pop-pink"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
