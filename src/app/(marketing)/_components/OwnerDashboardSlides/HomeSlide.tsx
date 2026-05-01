"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

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
    <article className="relative overflow-hidden rounded-2xl border border-warm-cream1 bg-white shadow-lg">
      <Image
        src="/marketing/dashboard/home.png"
        alt="letstrylocs dashboard home — bookings, orders, and visitor traffic"
        width={1280}
        height={720}
        className="h-auto w-full"
        priority
      />
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-[6%] top-[35%] rounded-md bg-white/95 px-3 py-1 font-sans text-3xl font-black text-pop-pink shadow"
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      >
        {count}
      </motion.div>
      <SlideCaption tag="Slide 1 · Home" title="See what's happening today." desc="Bookings, orders, visitor traffic — at a glance, the moment you sign in." />
    </article>
  );
}

function SlideCaption({ tag, title, desc }: { tag: string; title: string; desc: string }) {
  return (
    <footer className="border-t border-warm-cream1 px-5 py-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-warm-eyebrow">{tag}</p>
      <h3 className="mt-1 font-serif text-lg font-semibold text-warm-text">{title}</h3>
      <p className="mt-1 text-xs text-warm-textMuted">{desc}</p>
    </footer>
  );
}
