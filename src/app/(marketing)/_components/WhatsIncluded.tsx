"use client";

import { motion } from "framer-motion";
import { useFadeUp } from "./_motion";

const INCLUDED = [
  {
    title: "Custom domain",
    desc: "Registered in your name. yourshop.com is yours — even if you leave.",
  },
  {
    title: "Online booking",
    desc: "Customers book directly. You get a text.",
  },
  {
    title: "Owner dashboard",
    desc: "Visitors, bookings, leads, billing — one place.",
  },
  {
    title: "Free updates",
    desc: "Text us a change. Usually done same day.",
  },
] as const;

export function WhatsIncluded() {
  const fadeUp = useFadeUp();

  return (
    <section className="bg-white px-6 py-16 md:py-20">
      <div className="mx-auto max-w-4xl">
        <motion.p
          {...fadeUp}
          className="text-center text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — What you get —
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ delay: 0.05 }}
          className="mt-2 text-center font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Everything, <em className="text-warm-accent italic">handled.</em>
        </motion.h2>

        <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {INCLUDED.map((item, i) => (
            <motion.li
              key={item.title}
              {...fadeUp}
              transition={{ delay: 0.1 + i * 0.06 }}
              className="rounded-xl border border-warm-cream1 bg-warm-cream2 p-5"
            >
              <h3 className="font-serif text-base font-semibold text-warm-text">
                {item.title}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-warm-textMuted">
                {item.desc}
              </p>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
