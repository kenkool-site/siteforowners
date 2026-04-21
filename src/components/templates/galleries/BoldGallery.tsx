"use client";

import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function BoldGallery({ images, colors }: GalleryProps) {
  if (images.length === 0) return null;

  // Build alternating rows: 1 large, then 2 small
  const rows: string[][] = [];
  let idx = 0;
  while (idx < images.length) {
    rows.push([images[idx]]);
    idx++;
    if (idx < images.length) {
      const pair = [images[idx]];
      idx++;
      if (idx < images.length) {
        pair.push(images[idx]);
        idx++;
      }
      rows.push(pair);
    }
  }

  return (
    <section className="py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-5xl space-y-4 px-6">
        {rows.map((row, ri) => (
          <div key={ri}>
            {row.length === 1 ? (
              <div className="relative aspect-[16/9] overflow-hidden rounded-xl">
                <Image
                  src={row[0]}
                  alt={`Gallery ${ri}`}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  unoptimized
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {row.map((src, i) => (
                  <div key={i} className="relative aspect-square overflow-hidden rounded-xl">
                    <Image src={src} alt={`Gallery ${ri}-${i}`} fill className="object-cover" sizes="50vw" unoptimized />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
