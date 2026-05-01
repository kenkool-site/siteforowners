"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { useFadeUp } from "./_motion";

const VERTICALS = [
  { label: "Salon", image: "/marketing/customer-view/salon-thumb.png" },
  { label: "Barber", image: "/marketing/customer-view/barber-thumb.png" },
  { label: "Nail shop", image: "/marketing/customer-view/nails-thumb.png" },
] as const;

export function CustomerView() {
  const fadeUp = useFadeUp();

  return (
    <section id="examples" className="bg-warm-cream1 px-6 py-16 md:py-20">
      <div className="mx-auto max-w-3xl">
        <motion.p
          {...fadeUp}
          className="text-xs font-bold uppercase tracking-[0.2em] text-warm-eyebrow"
        >
          — What customers see —
        </motion.p>
        <motion.h2
          {...fadeUp}
          transition={{ delay: 0.05 }}
          className="mt-2 font-serif text-3xl font-semibold leading-tight text-warm-text md:text-4xl"
        >
          A site that <em className="text-warm-accent italic">looks like your shop.</em>
        </motion.h2>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.1 }}
          style={{ transform: "rotate(-1.5deg)" }}
          className="mt-8 rounded-2xl bg-black p-2 shadow-xl"
        >
          <Image
            src="/marketing/customer-view/letstrylocs.png"
            alt="letstrylocs.com — Brooklyn loctician site, mobile view"
            width={750}
            height={1100}
            className="h-auto w-full rounded-xl"
          />
        </motion.div>

        <ul className="mt-6 grid grid-cols-3 gap-3">
          {VERTICALS.map((v, i) => (
            <motion.li
              key={v.label}
              {...fadeUp}
              transition={{ delay: 0.2 + i * 0.06 }}
              className="overflow-hidden rounded-xl border border-warm-cream2 bg-white"
            >
              <div className="relative aspect-[3/4] w-full">
                <Image
                  src={v.image}
                  alt={`${v.label} preview thumbnail`}
                  fill
                  sizes="(max-width: 768px) 33vw, 200px"
                  className="object-cover"
                />
              </div>
              <p className="px-3 py-2 text-center text-[11px] font-semibold text-warm-text">
                {v.label}
              </p>
            </motion.li>
          ))}
        </ul>

        <p className="mt-4 text-center text-xs italic text-warm-textMuted">
          Mobile-first. Bilingual. Yours to own.
        </p>
      </div>
    </section>
  );
}
