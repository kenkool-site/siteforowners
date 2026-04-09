"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  colors: ThemeColors;
}

export function BoldAbout({ paragraphs, colors }: AboutProps) {
  const pullQuote = paragraphs[0] || "";
  const rest = paragraphs.slice(1);

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-3xl">
        <AnimateSection animation="fade-in">
          <blockquote
            className="mb-10 text-2xl font-medium italic leading-relaxed md:text-3xl"
            style={{ color: colors.primary }}
          >
            &ldquo;{pullQuote}&rdquo;
          </blockquote>
        </AnimateSection>
        {rest.map((p, i) => (
          <AnimateSection key={i} delay={0.3 + i * 0.15}>
            <p className="mb-4 text-base leading-relaxed opacity-70 md:text-lg" style={{ color: colors.background }}>
              {p}
            </p>
          </AnimateSection>
        ))}
      </div>
    </section>
  );
}
