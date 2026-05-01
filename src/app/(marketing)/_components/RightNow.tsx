"use client";

import { motion } from "framer-motion";
import { useFadeUp } from "./_motion";

const TOOLS = [
  { tag: "Bookings", value: "Acuity / Booksy / Vagaro" },
  { tag: "Customers", value: "Instagram DMs all day" },
  { tag: "Website", value: "None or a Linktree" },
  { tag: "Tracking", value: "Notebook & memory" },
] as const;

export function RightNow() {
  const fadeUp = useFadeUp();

  return (
    <section className="bg-warm-cream2 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          {...fadeUp}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — Right now —
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          You&rsquo;re juggling{" "}
          <em className="text-warm-accent italic">five different things.</em>
        </motion.h2>

        <ul className="mt-8 grid grid-cols-2 gap-3">
          {TOOLS.map((tool, i) => (
            <motion.li
              key={tool.tag}
              {...fadeUp}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="rounded-xl border border-warm-cream1 bg-white p-4"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-warm-eyebrow">
                {tool.tag}
              </p>
              <p className="mt-1 text-xs font-medium text-warm-text">{tool.value}</p>
            </motion.li>
          ))}
        </ul>

        <motion.p
          {...fadeUp}
          transition={{ delay: 0.5 }}
          className="mt-6 text-sm text-warm-textMuted"
        >
          → One place instead.{" "}
          <strong className="text-warm-text">
            Site, booking, and a dashboard you actually like.
          </strong>
        </motion.p>
      </div>
    </section>
  );
}
