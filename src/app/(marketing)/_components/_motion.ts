"use client";

import { useReducedMotion } from "framer-motion";

/**
 * Shared scroll-reveal config for marketing-page sections. Spread the return
 * value onto a motion element; pass `transition={{ delay }}` separately when
 * staggering. The viewport margin is asymmetric ("-80px" only on the bottom)
 * so that elements still trigger on short landscape-mobile viewports where a
 * symmetric "-80px" inset would never satisfy IntersectionObserver and the
 * `once: true` lock would leave them stuck at opacity 0 forever.
 */
export function useFadeUp() {
  const reduceMotion = useReducedMotion();
  return {
    initial: reduceMotion ? false : { opacity: 0, y: 12 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: "0px 0px -80px 0px" },
  } as const;
}
