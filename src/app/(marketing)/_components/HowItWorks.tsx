"use client";

import { motion, useReducedMotion } from "framer-motion";

const STEPS = [
  {
    num: "1",
    title: "We build your site",
    desc: "Tell us your business, services, photos. Site ready in 24 hours.",
  },
  {
    num: "2",
    title: "You approve",
    desc: "Look it over. Want a change? Text us. Done same day.",
  },
  {
    num: "3",
    title: "You start getting bookings",
    desc: "Customers find you, book online, you get a text.",
  },
];

export function HowItWorks() {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? false : { opacity: 0, y: 12 };

  return (
    <section className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — How it works —
        </motion.p>
        <motion.h2
          initial={initial}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          Three steps. <em className="text-warm-accent italic">No tech talk.</em>
        </motion.h2>

        <ol className="mt-8 space-y-6">
          {STEPS.map((step, i) => (
            <motion.li
              key={step.num}
              initial={initial}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ delay: 0.1 + i * 0.08 }}
              className="flex items-start gap-4"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-pop-pink font-sans text-base font-extrabold text-pop-cream">
                {step.num}
              </span>
              <div>
                <h3 className="text-base font-bold text-warm-text">{step.title}</h3>
                <p className="mt-1 text-sm text-warm-textMuted">{step.desc}</p>
              </div>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}
