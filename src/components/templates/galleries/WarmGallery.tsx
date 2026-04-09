"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface GalleryProps {
  images: string[];
  colors: ThemeColors;
}

export function WarmGallery({ images, colors }: GalleryProps) {
  const [featured, setFeatured] = useState(0);

  if (images.length === 0) return null;

  // If fewer than 2 images, just show a simple grid
  if (images.length < 2) {
    return (
      <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
        <div className="mx-auto max-w-4xl">
          <div className="relative aspect-[16/9] overflow-hidden rounded-2xl">
            <Image src={images[0]} alt="Gallery" fill className="object-cover" sizes="100vw" unoptimized />
          </div>
        </div>
      </section>
    );
  }

  const thumbnails = images.slice(0, 5);

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.muted }}>
      <div className="mx-auto max-w-4xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-semibold md:text-4xl" style={{ color: colors.foreground }}>
            Gallery
          </h2>
        </AnimateSection>

        {/* Featured image */}
        <div className="relative mb-4 aspect-[16/9] overflow-hidden rounded-2xl">
          <AnimatePresence mode="wait">
            <motion.div
              key={featured}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="absolute inset-0"
            >
              <Image
                src={images[featured]}
                alt={`Featured gallery image`}
                fill
                className="object-cover"
                sizes="100vw"
                unoptimized
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Thumbnails */}
        <div className="grid grid-cols-5 gap-2">
          {thumbnails.map((src, i) => (
            <button
              key={i}
              onClick={() => setFeatured(i)}
              className={`relative aspect-square overflow-hidden rounded-xl transition-all ${
                featured === i ? "ring-2 ring-offset-2" : "opacity-70 hover:opacity-100"
              }`}
              style={featured === i ? { outlineColor: colors.primary } : undefined}
            >
              <Image src={src} alt={`Thumbnail ${i + 1}`} fill className="object-cover" sizes="20vw" unoptimized />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
