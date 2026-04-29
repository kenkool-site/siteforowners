"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { ensureReadable } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface RunwayGalleryProps {
  images: string[];
  colors: ThemeColors;
}

const TILE_CLASSES = [
  "md:row-span-2 md:min-h-[34rem]",
  "md:min-h-[16rem]",
  "md:row-span-2 md:min-h-[34rem]",
  "md:min-h-[16rem]",
  "md:col-span-2 md:min-h-[20rem]",
  "md:min-h-[20rem]",
];

export function RunwayGallery({ images, colors }: RunwayGalleryProps) {
  if (images.length === 0) return null;

  const galleryImages = images.slice(0, 6);
  const gold = ensureReadable(colors.primary || "#D8B255", "#050505", 3);

  return (
    <section
      id="gallery"
      className="relative isolate overflow-hidden border-t border-white/10 px-6 py-24 text-white md:px-10 lg:px-16"
      style={{
        background:
          "radial-gradient(circle at 10% 10%, rgba(216,178,85,0.16), transparent 28rem), radial-gradient(circle at 86% 42%, rgba(216,178,85,0.12), transparent 24rem), #050505",
      }}
    >
      <div className="absolute left-1/2 top-0 h-full w-px bg-white/10" aria-hidden />
      <div className="relative z-10 mx-auto max-w-7xl">
        <AnimateSection>
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <h2 className="max-w-4xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.05em] sm:text-5xl md:text-6xl lg:text-7xl">
              Gallery After The Chair
            </h2>
            <p className="max-w-sm text-sm leading-7 text-white/[0.62] md:text-base">
              A dramatic bento gallery for polished texture, sharp silhouettes, and finished looks built
              for close inspection.
            </p>
          </div>
        </AnimateSection>

        <div className="grid auto-rows-[16rem] grid-cols-1 gap-4 md:grid-cols-3">
          {galleryImages.map((src, index) => (
            <AnimateSection
              key={`${src}-${index}`}
              animation="scale-in"
              delay={index * 0.08}
              className={`group relative min-h-[16rem] overflow-hidden border bg-[#0D0B08] shadow-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_48px_rgba(216,178,85,0.18)] ${TILE_CLASSES[index]}`}
            >
              <div
                className="absolute inset-0 z-10 border opacity-70 transition-opacity duration-300 group-hover:opacity-100"
                style={{ borderColor: `${gold}42` }}
                aria-hidden
              />
              <Image
                src={src}
                alt={`Editorial hair gallery image ${index + 1}`}
                fill
                className="object-cover brightness-75 contrast-110 saturate-90 transition duration-700 group-hover:scale-110 group-hover:brightness-95 group-hover:saturate-105"
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized
              />
              <div className="absolute inset-0 z-10 bg-gradient-to-t from-black/70 via-black/10 to-white/10 transition-opacity duration-300 group-hover:opacity-75" />
              <div className="absolute bottom-5 left-5 z-20 text-[0.65rem] font-black uppercase tracking-[0.34em] text-white/70">
                Look {String(index + 1).padStart(2, "0")}
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
