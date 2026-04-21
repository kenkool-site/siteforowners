"use client";

import { useState } from "react";
import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function ClassicGallery({ images, colors }: GalleryProps) {
  const [selected, setSelected] = useState<string | null>(null);

  if (images.length === 0) return null;

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            Gallery
          </h2>
        </AnimateSection>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {images.map((src, i) => (
            <button
              key={i}
              className="group relative aspect-square overflow-hidden rounded-xl"
              onClick={() => setSelected(src)}
            >
              <Image
                src={src}
                alt={`Gallery image ${i + 1}`}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="(max-width: 768px) 50vw, 33vw"
                unoptimized
              />
            </button>
          ))}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setSelected(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]">
            <Image src={selected} alt="Gallery preview" width={900} height={600} className="rounded-lg object-contain" unoptimized />
          </div>
        </div>
      )}
    </section>
  );
}
