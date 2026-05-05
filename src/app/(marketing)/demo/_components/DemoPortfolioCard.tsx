"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";

type DemoPortfolioCardProps = {
  category: string;
  title: string;
  accent: string;
  tone: string;
  action: string;
  images?: readonly string[];
  featured?: boolean;
};

const SLIDE_MS = 3200;

export function DemoPortfolioCard({
  category,
  title,
  accent,
  tone,
  action,
  images = [],
  featured = false,
}: DemoPortfolioCardProps) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = useReducedMotion();
  const hasImages = images.length > 0;

  useEffect(() => {
    if (!hasImages || images.length === 1 || paused || reduceMotion) return;
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, SLIDE_MS);
    return () => clearInterval(timer);
  }, [hasImages, images.length, paused, reduceMotion]);

  return (
    <article
      className={`group overflow-hidden rounded-[2rem] bg-gradient-to-br ${tone} p-2 text-pop-cream shadow-xl ${
        featured ? "md:col-span-2" : ""
      }`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setPaused(false);
        }
      }}
    >
      <div className="rounded-[1.5rem] border border-white/15 bg-black/30 p-2">
        <div className="flex items-center justify-between gap-4 px-2 py-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-pop-cream/65">
            {category}
          </p>
          <span className={`h-3 w-3 rounded-full ${accent}`} />
        </div>

        <div className="overflow-hidden rounded-[1.25rem] bg-black/40 text-warm-deep">
          {hasImages ? (
            <div className="relative aspect-[9/16] overflow-hidden rounded-[1.25rem] bg-black">
              {images.map((src, imageIndex) => (
                <Image
                  key={src}
                  src={src}
                  alt={`${category} portfolio preview ${imageIndex + 1}`}
                  fill
                  sizes={featured ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"}
                  className={`absolute inset-0 h-full w-full object-contain transition duration-700 ${
                    imageIndex === index ? "opacity-100" : "opacity-0"
                  }`}
                />
              ))}
              <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-3">
                <div className="flex gap-1.5">
                  {images.map((src, imageIndex) => (
                    <button
                      key={src}
                      type="button"
                      aria-label={`Show ${category} preview ${imageIndex + 1}`}
                      onClick={() => setIndex(imageIndex)}
                      className={`h-1.5 rounded-full transition-all ${
                        imageIndex === index ? "w-6 bg-white" : "w-2 bg-white/45"
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className={`h-64 rounded-[1.25rem] ${accent}`} />
          )}
        </div>

        <div className="px-2 pb-3 pt-4">
          <h3 className="text-xl font-black leading-tight">{title}</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex rounded-full bg-pop-cream px-3 py-1 text-[11px] font-black text-warm-deep">
              {action}
            </span>
            <span className="inline-flex rounded-full border border-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-pop-cream/70">
              Dashboard included
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
