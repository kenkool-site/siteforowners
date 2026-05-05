"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

const ADMIN_SLIDES = [
  {
    label: "Schedule",
    title: "See today at a glance.",
    stat: "4",
    statLabel: "bookings today",
    rows: ["10:00 AM - Gel set", "12:00 PM - Retwist", "2:30 PM - Fade"],
  },
  {
    label: "Leads",
    title: "Follow up while they are warm.",
    stat: "7",
    statLabel: "new leads",
    rows: ["Velvet Lash Studio", "Crown Nails", "Fresh Cut Lounge"],
  },
  {
    label: "Services",
    title: "Keep prices and services current.",
    stat: "12",
    statLabel: "services managed",
    rows: ["Gel manicure - $40", "Retwist - $95", "Skin fade - $45"],
  },
  {
    label: "Updates",
    title: "Post changes without rebuilding the site.",
    stat: "3",
    statLabel: "recent updates",
    rows: ["Holiday hours", "New style added", "Deposit policy"],
  },
] as const;

const SLIDE_MS = 3600;

export function DemoAdminShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % ADMIN_SLIDES.length);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const current = ADMIN_SLIDES[index];

  return (
    <div
      className="mx-auto mt-12 max-w-6xl rounded-[2rem] border border-pop-cream/15 bg-pop-cream p-3 text-warm-deep shadow-2xl md:p-5"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
    >
      <div className="grid gap-4 rounded-[1.5rem] bg-white p-4 md:grid-cols-[0.78fr_1.22fr] md:p-5">
        <div className="rounded-[1.35rem] bg-warm-deep p-5 text-pop-cream">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-pop-pink">
            Admin dashboard
          </p>
          <p className="mt-8 text-6xl font-black leading-none">{current.stat}</p>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.16em] text-pop-cream/55">
            {current.statLabel}
          </p>
          <div className="mt-8 flex gap-1.5">
            {ADMIN_SLIDES.map((slide, slideIndex) => (
              <button
                key={slide.label}
                type="button"
                aria-label={`Show ${slide.label} admin slide`}
                onClick={() => setIndex(slideIndex)}
                className={`h-1.5 rounded-full transition-all ${
                  slideIndex === index ? "w-8 bg-pop-pink" : "w-2 bg-pop-cream/35"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="rounded-[1.35rem] border border-warm-cream1 bg-warm-cream2 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-warm-eyebrow">
                {current.label}
              </p>
              <h3 className="mt-2 text-3xl font-black leading-none text-warm-deep">
                {current.title}
              </h3>
            </div>
            <span className="rounded-full bg-pop-pink px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-pop-cream">
              Auto slide
            </span>
          </div>

          <div className="mt-8 space-y-3">
            {current.rows.map((row) => (
              <div
                key={row}
                className="flex items-center justify-between rounded-2xl border border-warm-cream1 bg-white px-4 py-3"
              >
                <span className="text-sm font-black text-warm-deep">{row}</span>
                <span className="h-2 w-10 rounded-full bg-pop-pink/30" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
