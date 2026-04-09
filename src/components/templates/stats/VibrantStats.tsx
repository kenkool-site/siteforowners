"use client";

import { useRef, useEffect, useState } from "react";
import { useInView } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";

interface VibrantStatsProps {
  serviceCount: number;
  address?: string;
  colors: ThemeColors;
}

function useCountUp(target: number, inView: boolean, duration = 1500): number {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const step = Math.ceil(target / (duration / 16));
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(start);
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, inView, duration]);
  return count;
}

export function VibrantStats({ serviceCount, address, colors }: VibrantStatsProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  const servicesNum = useCountUp(serviceCount, inView);
  const ratingNum = useCountUp(5, inView, 800);

  // Try to extract neighborhood from address
  const neighborhood = address
    ? address.split(",").find((part) => part.trim().match(/brooklyn|queens|bronx|manhattan|harlem|flatbush|bed-stuy|crown heights|bushwick/i))?.trim() || "NYC"
    : null;

  const stats = [
    { value: servicesNum, suffix: "+", label: "Services Offered" },
    { value: ratingNum, suffix: "★", label: "Star Rating" },
    { value: null, suffix: null, label: neighborhood ? `Proudly in ${neighborhood}` : `${serviceCount}+ Happy Clients` },
  ];

  return (
    <section className="px-6 py-16" style={{ background: `linear-gradient(135deg, ${colors.primary}10, ${colors.accent}10)` }}>
      <div ref={ref} className="mx-auto grid max-w-3xl grid-cols-1 gap-8 text-center md:grid-cols-3">
        {stats.map((stat, i) => (
          <div key={i}>
            {stat.value !== null ? (
              <p className="text-4xl font-bold md:text-5xl" style={{ color: colors.primary }}>
                {stat.value}{stat.suffix}
              </p>
            ) : (
              <p className="text-2xl font-bold md:text-3xl" style={{ color: colors.primary }}>
                {stat.label.includes("Proudly") ? "📍" : "💯"}
              </p>
            )}
            <p className="mt-2 text-sm font-medium opacity-60" style={{ color: colors.foreground }}>
              {stat.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
