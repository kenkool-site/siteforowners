"use client";

import { AnimateSection } from "./shared/AnimateSection";
import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateRatingProps {
  rating: number;
  reviewCount?: number;
  colors: ThemeColors;
}

function Stars({ rating, color }: { rating: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => {
        const fill = rating >= star ? 1 : rating >= star - 0.5 ? 0.5 : 0;
        return (
          <svg
            key={star}
            className="h-5 w-5 md:h-6 md:w-6"
            viewBox="0 0 24 24"
            fill="none"
          >
            {/* Background star (empty) */}
            <path
              d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
              fill={`${color}30`}
            />
            {/* Filled portion */}
            {fill > 0 && (
              <clipPath id={`star-clip-${star}`}>
                <rect x="0" y="0" width={fill === 1 ? "24" : "12"} height="24" />
              </clipPath>
            )}
            {fill > 0 && (
              <path
                d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
                fill={color}
                clipPath={`url(#star-clip-${star})`}
              />
            )}
          </svg>
        );
      })}
    </div>
  );
}

export function TemplateRating({ rating, reviewCount, colors }: TemplateRatingProps) {
  return (
    <AnimateSection>
      <section className="px-6 py-10" style={{ backgroundColor: colors.muted }}>
        <div className="mx-auto flex max-w-lg flex-col items-center gap-3 text-center">
          <p
            className="text-xs font-semibold uppercase tracking-widest"
            style={{ color: colors.primary }}
          >
            Loved by our community
          </p>
          <Stars rating={rating} color={colors.primary} />
          <p className="text-2xl font-bold" style={{ color: colors.foreground }}>
            {rating} out of 5
          </p>
          {reviewCount && (
            <p className="text-sm" style={{ color: colors.foreground, opacity: 0.7 }}>
              Based on {reviewCount} Google reviews
            </p>
          )}
        </div>
      </section>
    </AnimateSection>
  );
}
