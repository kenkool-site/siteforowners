"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface RunwayAboutProps {
  paragraphs: string[];
  image?: string;
  colors: ThemeColors;
}

export function RunwayAbout({ paragraphs, image, colors }: RunwayAboutProps) {
  const pullQuote = paragraphs[0] || "Texture respected. Style elevated.";
  const rest = paragraphs.slice(1);
  const gold = ensureReadable(colors.primary || "#D8B255", "#050505", 3);

  return (
    <section
      className="relative isolate overflow-hidden border-t border-white/10 px-6 py-24 text-white md:px-10 lg:px-16"
      style={{
        background:
          "radial-gradient(circle at 16% 18%, rgba(216,178,85,0.14), transparent 26rem), radial-gradient(circle at 84% 80%, rgba(216,178,85,0.1), transparent 22rem), #050505",
      }}
    >
      <div className="absolute inset-x-0 top-1/2 h-px bg-white/10" aria-hidden />
      <div className="relative z-10 mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
        <AnimateSection animation="slide-left">
          <p
            className="mb-5 text-xs font-black uppercase tracking-[0.38em]"
            style={{ color: gold }}
          >
            Client Notes
          </p>
          <blockquote className="max-w-3xl text-5xl font-black uppercase leading-[0.86] tracking-[-0.065em] sm:text-6xl md:text-7xl">
            &ldquo;{pullQuote}&rdquo;
          </blockquote>
        </AnimateSection>

        <div className="grid gap-5 md:grid-cols-[0.88fr_1fr] lg:items-stretch">
          {image && (
            <AnimateSection animation="scale-in" className="relative min-h-[24rem]">
              <div
                className="absolute -inset-3 border"
                style={{ borderColor: `${gold}28`, boxShadow: `0 0 70px ${gold}18` }}
                aria-hidden
              />
              <div className="group relative h-full min-h-[24rem] overflow-hidden border border-white/15 bg-[#0D0B08]">
                <Image
                  src={image}
                  alt=""
                  fill
                  className="object-cover brightness-75 contrast-110 saturate-95 transition duration-700 group-hover:scale-110 group-hover:brightness-95"
                  sizes="(max-width: 768px) 100vw, 36vw"
                  unoptimized
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-white/10" />
                <div
                  className="absolute inset-5 border"
                  style={{ borderColor: `${gold}66` }}
                  aria-hidden
                />
              </div>
            </AnimateSection>
          )}

          {rest.length > 0 && (
            <AnimateSection
              animation="slide-right"
              delay={0.12}
              className={image ? "h-full" : "md:col-span-2"}
            >
              <div
                className="h-full border bg-white/[0.055] p-7 shadow-2xl backdrop-blur-md md:p-9"
                style={{ borderColor: `${gold}30` }}
              >
                {rest.map((paragraph, index) => (
                  <p
                    key={index}
                    className="mb-5 text-base leading-8 text-white/[0.68] last:mb-0 md:text-lg"
                  >
                    {paragraph}
                  </p>
                ))}
              </div>
            </AnimateSection>
          )}
        </div>
      </div>
    </section>
  );
}
