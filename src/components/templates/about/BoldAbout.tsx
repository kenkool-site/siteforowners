"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface AboutProps {
  paragraphs: string[];
  /** Second gallery image / owner upload when “About image” is enabled */
  image?: string;
  colors: ThemeColors;
}

export function BoldAbout({ paragraphs, image, colors }: AboutProps) {
  const pullQuote = paragraphs[0] || "";
  const rest = paragraphs.slice(1);

  const rc = readableColors(colors);

  const storyHeading = (
    <AnimateSection animation="fade-in">
      <h2 className="mb-8 text-4xl font-black uppercase tracking-tight md:mb-10 md:text-5xl lg:text-6xl" style={{ color: rc.textOnFg }}>
        Our Story
      </h2>
    </AnimateSection>
  );

  const quoteAndBody = (
    <>
      <AnimateSection animation="fade-in" delay={0.08}>
        <blockquote
          className="mb-10 text-2xl font-medium italic leading-relaxed md:text-3xl"
          style={{ color: rc.primaryOnFg }}
        >
          &ldquo;{pullQuote}&rdquo;
        </blockquote>
      </AnimateSection>
      {rest.map((p, i) => (
        <AnimateSection key={i} delay={0.22 + i * 0.15}>
          <p className="mb-4 text-base leading-relaxed opacity-70 md:text-lg" style={{ color: rc.textOnFg }}>
            {p}
          </p>
        </AnimateSection>
      ))}
    </>
  );

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.foreground }}>
      {image ? (
        <div className="mx-auto grid max-w-6xl items-center gap-10 md:grid-cols-2 md:gap-14 lg:gap-16">
          <AnimateSection animation="slide-left">
            <div className="relative aspect-[4/5] overflow-hidden rounded-xl shadow-2xl">
              <Image
                src={image}
                alt="Our story"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                unoptimized
              />
            </div>
          </AnimateSection>
          <div>
            {storyHeading}
            {quoteAndBody}
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl">
          {storyHeading}
          {quoteAndBody}
        </div>
      )}
    </section>
  );
}
