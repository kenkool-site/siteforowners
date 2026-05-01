"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useFadeUp } from "./_motion";

const INCLUSIONS = "Site · booking · dashboard · hosting · domain · updates";

export function Pricing() {
  const fadeUp = useFadeUp();

  return (
    <section id="pricing" className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-md">
        <motion.p
          {...fadeUp}
          className="text-center text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — Pricing —
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ delay: 0.05 }}
          className="mt-2 text-center font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Try it <em className="text-warm-accent italic">free for a month.</em>
        </motion.h2>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.1 }}
          className="relative mt-10 rounded-2xl border-2 border-pop-pink bg-white p-8 text-center"
        >
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-pop-pink px-3 py-1 text-[10px] font-extrabold uppercase tracking-[0.15em] text-pop-cream">
            Free for 1 month
          </span>
          <p className="font-sans text-5xl font-black leading-none text-warm-text">
            $50
            <span className="ml-1 text-lg font-semibold text-warm-textMuted">/month</span>
          </p>
          <p className="mt-2 text-xs text-warm-textMuted">
            after the free month · cancel anytime
          </p>
          <p className="mt-4 text-sm text-warm-text">{INCLUSIONS}</p>

          <Button
            asChild
            size="lg"
            className="mt-6 rounded-full bg-pop-pink px-8 py-5 text-sm font-bold text-pop-cream hover:bg-pop-pink/90"
          >
            <Link href="/preview">Start free month</Link>
          </Button>
        </motion.div>

        <p className="mt-4 text-center text-xs text-warm-textMuted">
          No card up front · You own your domain
        </p>
      </div>
    </section>
  );
}
