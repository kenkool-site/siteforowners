"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useFadeUp } from "./_motion";

export function FinalCTA() {
  const fadeUp = useFadeUp();

  return (
    <section className="bg-pop-pink px-6 py-20 text-center text-pop-cream">
      <div className="mx-auto max-w-xl">
        <motion.h2
          {...fadeUp}
          className="font-sans text-3xl font-black leading-tight md:text-5xl"
        >
          Ready to stop missing
          <br />
          bookings?
        </motion.h2>

        <motion.div
          {...fadeUp}
          transition={{ delay: 0.1 }}
          className="mt-8"
        >
          <Button
            asChild
            size="lg"
            className="rounded-full bg-black px-8 py-6 text-base font-extrabold text-pop-cream hover:bg-black/85"
          >
            <Link href="/preview">Create My Free Preview →</Link>
          </Button>
          <p className="mt-4 text-xs opacity-90">
            5 min · No card · Free for 1 month
          </p>
        </motion.div>
      </div>
    </section>
  );
}
