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
  images?: string[];
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
      className={`group overflow-hidden rounded-[2rem] bg-gradient-to-br ${tone} p-4 text-pop-cream shadow-xl ${
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
      <div className="rounded-[1.5rem] border border-white/15 bg-black/30 p-4">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-pop-cream/65">
            {category}
          </p>
          <span className={`h-3 w-3 rounded-full ${accent}`} />
        </div>

        <div className="mt-8 overflow-hidden rounded-[1.25rem] bg-pop-cream p-3 text-warm-deep">
          {hasImages ? (
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-warm-deep">
              {images.map((src, imageIndex) => (
                <Image
                  key={src}
                  src={src}
                  alt={`${category} portfolio preview ${imageIndex + 1}`}
                  fill
                  sizes={featured ? "(min-width: 768px) 66vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"}
                  className={`absolute inset-0 h-full w-full object-cover transition duration-700 ${
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
                <span className="rounded-full bg-black/65 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-white backdrop-blur">
                  Auto slide
                </span>
              </div>
            </div>
          ) : (
            <div className={`h-28 rounded-2xl ${accent}`} />
          )}
          <div className="mt-4 h-3 w-3/4 rounded-full bg-warm-deep/20" />
          <div className="mt-2 h-3 w-1/2 rounded-full bg-warm-deep/15" />
          <div className="mt-5 inline-flex rounded-full bg-warm-deep px-4 py-2 text-xs font-black text-pop-cream">
            {action}
          </div>
        </div>

        <h3 className="mt-5 text-2xl font-black leading-tight">{title}</h3>
        <p className="mt-4 inline-flex rounded-full border border-white/20 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-pop-cream/75">
          Owner dashboard included
        </p>
      </div>
    </article>
  );
}
