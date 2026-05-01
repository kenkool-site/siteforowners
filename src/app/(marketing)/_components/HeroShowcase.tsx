"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

const SITES = [
  {
    label: "Locs",
    business: "letstrylocs.com",
    accent: "bg-pink-600",
    tint: "from-pink-100 to-rose-50",
    stat: "115",
    service: "Retwist & Style",
    price: "$140",
  },
  {
    label: "Barber",
    business: "Mike's Cuts",
    accent: "bg-amber-500",
    tint: "from-amber-100 to-orange-50",
    stat: "42",
    service: "Skin fade",
    price: "$45",
  },
  {
    label: "Nails",
    business: "Nailz By V",
    accent: "bg-fuchsia-500",
    tint: "from-fuchsia-100 to-pink-50",
    stat: "28",
    service: "Gel set",
    price: "$75",
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

      <div id="hero-showcase-panel" role="tabpanel" className="relative">
        <div className="absolute -inset-6 rounded-[2rem] bg-black/20 blur-3xl" />
        <AnimatePresence mode="wait">
          <motion.div
            key={current.label}
            initial={reduceMotion ? false : { opacity: 0, y: 12, rotate: -1 }}
            animate={{ opacity: 1, y: 0, rotate: -1.5 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -12, rotate: -2 }}
            transition={{ duration: 0.35 }}
            className="relative overflow-hidden rounded-[1.75rem] border border-white/15 bg-slate-950 p-4 shadow-2xl"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${current.tint} opacity-20`} />
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white text-slate-950 shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-950 px-3 py-2">
                <span className="h-2 w-2 rounded-full bg-rose-300" />
                <span className="h-2 w-2 rounded-full bg-amber-300" />
                <span className="h-2 w-2 rounded-full bg-emerald-300" />
                <span className="ml-2 truncate rounded-full bg-white/10 px-2 py-0.5 text-[9px] font-semibold text-white/70">
                  owner dashboard
                </span>
              </div>

              <div className="grid gap-3 p-3 sm:grid-cols-[0.78fr_1fr]">
                <div className="rounded-2xl bg-slate-950 p-3 text-white">
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/55">
                    {current.business}
                  </p>
                  <p className="mt-3 text-3xl font-black leading-none">{current.stat}</p>
                  <p className="mt-1 text-[11px] text-white/65">visits this week</p>
                  <div className="mt-5 flex h-14 items-end gap-1.5">
                    {[58, 78, 34, 88, 62].map((height, i) => (
                      <motion.span
                        key={`${current.label}-${height}-${i}`}
                        className={`flex-1 rounded-t ${current.accent}`}
                        initial={reduceMotion ? false : { height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: reduceMotion ? 0 : i * 0.06, duration: 0.45 }}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                          Booked today
                        </p>
                        <p className="mt-1 text-sm font-black">{current.service}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black text-white ${current.accent}`}>
                        {current.price}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-slate-200 p-3">
                      <p className="text-2xl font-black">3</p>
                      <p className="text-[10px] text-slate-500">new leads</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 p-3">
                      <p className="text-2xl font-black">1</p>
                      <p className="text-[10px] text-slate-500">order paid</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <motion.div
              aria-hidden="true"
              className="absolute bottom-3 right-3 w-28 overflow-hidden rounded-[1.5rem] border-[6px] border-slate-950 bg-white shadow-2xl sm:w-32"
              initial={reduceMotion ? false : { y: 10 }}
              animate={reduceMotion ? {} : { y: [0, -6, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <div className={`h-16 ${current.accent}`} />
              <div className="space-y-2 p-2">
                <div className="h-3 w-16 rounded-full bg-slate-900" />
                <div className="h-2 w-20 rounded-full bg-slate-200" />
                <div className="rounded-xl bg-pink-50 p-2">
                  <div className="h-2 w-14 rounded-full bg-pink-300" />
                  <div className="mt-2 h-7 rounded-lg bg-white" />
                </div>
                <div className={`rounded-full px-2 py-1 text-center text-[9px] font-black text-white ${current.accent}`}>
                  Book now
                </div>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
        <p className="relative mt-3 text-center text-[10px] font-semibold text-pop-cream/75">
          Rendered preview inspired by {current.business}
        </p>
      </div>
    </div>
  );
}
