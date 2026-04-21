"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function VibrantGallery({ images, colors }: GalleryProps) {
  if (images.length === 0) return null;

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            Our Work
          </h2>
        </AnimateSection>
        <div className="grid grid-cols-3 gap-2">
          {images.map((src, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-xl">
                <Image
                  src={src}
                  alt={`Gallery image ${i + 1}`}
                  fill
                  className="object-cover transition-all duration-300 group-hover:scale-110 group-hover:saturate-[1.2]"
                  sizes="33vw"
                  unoptimized
                />
              </div>
          ))}
        </div>
      </div>
    </section>
  );
}
