"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { SlideCaption } from "./SlideCaption";

const NAV_ITEMS = [
  { label: "Home", active: true },
  { label: "Schedule" },
  { label: "Orders" },
  { label: "Services" },
  { label: "Updates" },
  { label: "Leads" },
  { label: "Billing" },
  { label: "Settings" },
];

const BAR_HEIGHTS = [55, 78, 42, 92, 68];
const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];

export function HomeSlide({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const [count, setCount] = useState(reduceMotion ? 113 : 0);

  useEffect(() => {
    if (!active || reduceMotion) {
      setCount(113);
      return;
    }
    setCount(0);
    const target = 113;
    const start = performance.now();
    const duration = 800;
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(1, elapsed / duration);
      setCount(Math.round(target * progress));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, reduceMotion]);

  return (
    <article className="overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <div className="flex aspect-[16/10] text-[9px] sm:text-[10px]">
        <aside className="w-[100px] shrink-0 border-r border-rose-100 bg-white p-2.5">
          <div className="text-[10px] font-bold text-rose-900">letstrylocs</div>
          <div className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-center font-semibold text-rose-700">
            View site ↗
          </div>
          <nav className="mt-3 space-y-0.5">
            {NAV_ITEMS.map((item) => (
              <div
                key={item.label}
                className={`rounded px-2 py-1 ${
                  item.active
                    ? "bg-rose-100 font-semibold text-rose-800"
                    : "text-gray-500"
                }`}
              >
                {item.label}
              </div>
            ))}
          </nav>
        </aside>

        <div className="flex-1 bg-gray-50 p-2.5 sm:p-3">
          <div className="text-sm font-bold text-gray-900 sm:text-base">
            Good afternoon, letstrylocs
          </div>
          <div className="text-[8px] text-gray-500 sm:text-[9px]">
            Here&rsquo;s what&rsquo;s happening today
          </div>

          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[
              { num: 1, label: "New orders" },
              { num: 1, label: "Bookings today" },
              { num: 1, label: "Bookings next 7 days" },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-md border border-gray-200 bg-white px-2 py-1.5"
              >
                <div className="text-base font-extrabold leading-none text-rose-700 sm:text-lg">
                  {s.num}
                </div>
                <div className="mt-1 text-[7px] leading-tight text-gray-500 sm:text-[8px]">
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 rounded-lg bg-rose-100/80 p-2">
            <div className="text-[7px] font-bold uppercase tracking-wider text-rose-800 sm:text-[8px]">
              Visitors this week
            </div>
            <div className="text-xl font-black leading-none text-rose-700 sm:text-2xl">
              {count}
            </div>
            <div className="text-[7px] text-rose-700/80 sm:text-[8px]">
              People checked out your site
            </div>
            <div className="mt-1 flex h-6 items-end gap-1">
              {BAR_HEIGHTS.map((h, i) => (
                <motion.div
                  key={DAYS[i]}
                  className="flex-1 rounded-t bg-rose-600"
                  initial={reduceMotion ? false : { height: 0 }}
                  animate={{ height: active ? `${h}%` : "0%" }}
                  transition={{
                    duration: reduceMotion ? 0 : 0.6,
                    delay: reduceMotion ? 0 : 0.1 + i * 0.06,
                  }}
                  style={{ height: reduceMotion ? `${h}%` : undefined }}
                />
              ))}
            </div>
            <div className="mt-0.5 flex gap-1 text-[6px] text-rose-700/70 sm:text-[7px]">
              {DAYS.map((d) => (
                <div key={d} className="flex-1 text-center font-medium">
                  {d}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-2">
            <div className="text-[7px] font-bold uppercase tracking-wider text-gray-500 sm:text-[8px]">
              Recent activity
            </div>
            <div className="mt-1 rounded border border-gray-200 bg-white px-2 py-1.5">
              <div className="text-[8px] font-semibold text-gray-900 sm:text-[9px]">
                Ken booked Man bun loc
              </div>
              <div className="text-[7px] text-gray-500 sm:text-[8px]">
                2 days ago · 9:00 AM
              </div>
            </div>
          </div>
        </div>
      </div>

      <SlideCaption
        tag="Slide 1 · Home"
        title="See what's happening today."
        desc="Bookings, orders, visitor traffic — at a glance, the moment you sign in."
      />
    </article>
  );
}
