"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const SITES = [
  {
    label: "Locs",
    business: "letstrylocs.com",
    image: "/marketing/hero/letstrylocs.png",
    alt: "letstrylocs.com — Brooklyn loctician site, mobile view",
  },
  {
    label: "Barber",
    business: "Mike's Cuts",
    image: "/marketing/hero/barber.png",
    alt: "Mike's Cuts — barbershop site, mobile view",
  },
  {
    label: "Nails",
    business: "Nailz By V",
    image: "/marketing/hero/nails.png",
    alt: "Nailz By V — nail studio site, mobile view",
  },
];
const ADVANCE_MS = 4000;

export function HeroShowcase() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    if (paused || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % SITES.length);
    }, ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused, reduceMotion]);

  const current = SITES[index];

  return (
    <div
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
          setPaused(false);
        }
      }}
    >
      <div role="tablist" aria-label="Choose a vertical" className="mb-3 flex flex-wrap gap-2">
        {SITES.map((site, i) => (
          <button
            key={site.label}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls="hero-showcase-panel"
            onClick={() => setIndex(i)}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              i === index
                ? "bg-pop-cream text-pop-pink"
                : "bg-pop-cream/20 text-pop-cream hover:bg-pop-cream/30"
            }`}
          >
            {site.label}
          </button>
        ))}
      </div>

      <div
        id="hero-showcase-panel"
        role="tabpanel"
        className="rounded-2xl bg-black p-3 shadow-2xl"
        style={{ transform: "rotate(-1.5deg)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={current.label}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: 0.35 }}
            className="overflow-hidden rounded-xl"
          >
            <Image
              src={current.image}
              alt={current.alt}
              width={750}
              height={1000}
              priority={index === 0}
              className="h-auto w-full"
            />
          </motion.div>
        </AnimatePresence>
        <p className="mt-2 text-center text-[10px] text-pop-cream/70">↑ {current.business}</p>
      </div>
    </div>
  );
}
