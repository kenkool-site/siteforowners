"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function ElegantGallery({ images, colors }: GalleryProps) {
  if (images.length === 0) return null;

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-4xl">
        <div className="grid grid-cols-2 gap-6">
          {images.map((src, i) => (
            <AnimateSection key={i} animation="scale-in" delay={i * 0.1}>
              <div
                className={`relative overflow-hidden rounded-2xl ${
                  i % 2 === 1 ? "md:mt-8" : ""
                }`}
                style={{ aspectRatio: "4/5" }}
              >
                <Image
                  src={src}
                  alt={`Gallery image ${i + 1}`}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 50vw, 40vw"
                  unoptimized
                />
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
