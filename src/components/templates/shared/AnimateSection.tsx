"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

type Animation = "fade-up" | "fade-in" | "slide-left" | "slide-right" | "scale-in";

interface AnimateSectionProps {
  children: React.ReactNode;
  animation?: Animation;
  delay?: number;
  duration?: number;
  className?: string;
}

const VARIANTS: Record<Animation, { hidden: Record<string, number>; visible: Record<string, number> }> = {
  "fade-up": {
    hidden: { opacity: 0, y: 40 },
    visible: { opacity: 1, y: 0 },
  },
  "fade-in": {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  "slide-left": {
    hidden: { opacity: 0, x: -60 },
    visible: { opacity: 1, x: 0 },
  },
  "slide-right": {
    hidden: { opacity: 0, x: 60 },
    visible: { opacity: 1, x: 0 },
  },
  "scale-in": {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 },
  },
};

export function AnimateSection({
  children,
  animation = "fade-up",
  delay = 0,
  duration = 0.6,
  className,
}: AnimateSectionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const variant = VARIANTS[animation];

  return (
    <motion.div
      ref={ref}
      initial={variant.hidden}
      animate={inView ? variant.visible : variant.hidden}
      transition={{ duration, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
