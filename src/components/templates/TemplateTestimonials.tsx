"use client";

import { AnimateSection } from "./shared/AnimateSection";
import type { ThemeColors } from "@/lib/templates/themes";

export interface GoogleReview {
  authorName: string;
  rating: number;
  text: string;
  relativeTime: string;
}

interface TemplateTestimonialsProps {
  reviews: GoogleReview[];
  colors: ThemeColors;
  rating?: number;
  reviewCount?: number;
}

function StarRow({ rating, color }: { rating: number; color: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill={star <= rating ? color : `${color}30`}
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TemplateTestimonials({
  reviews,
  colors,
  rating,
  reviewCount,
}: TemplateTestimonialsProps) {
  return (
    <AnimateSection>
      <section className="px-6 py-16" style={{ backgroundColor: colors.background }}>
        <div className="mx-auto max-w-4xl">
          {/* Section header */}
          <div className="mb-10 text-center">
            <p
              className="mb-2 text-xs font-semibold uppercase tracking-widest"
              style={{ color: colors.primary }}
            >
              What Our Clients Say
            </p>
            {rating && (
              <div className="flex items-center justify-center gap-2">
                <StarRow rating={Math.round(rating)} color={colors.primary} />
                <span
                  className="text-sm font-medium"
                  style={{ color: colors.foreground }}
                >
                  {rating} stars
                  {reviewCount ? ` from ${reviewCount} reviews` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Review cards */}
          <div className="grid gap-6 md:grid-cols-3">
            {reviews.map((review, i) => (
              <div
                key={i}
                className="rounded-xl p-6"
                style={{ backgroundColor: colors.muted }}
              >
                {/* Stars */}
                <StarRow rating={review.rating} color={colors.primary} />

                {/* Review text */}
                <p
                  className="mt-3 text-sm leading-relaxed"
                  style={{ color: colors.foreground }}
                >
                  &ldquo;{review.text.length > 200
                    ? review.text.slice(0, 200).trim() + "..."
                    : review.text}&rdquo;
                </p>

                {/* Author */}
                <div className="mt-4 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      backgroundColor: colors.primary,
                      color: colors.background,
                    }}
                  >
                    {getInitials(review.authorName)}
                  </div>
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: colors.foreground }}
                    >
                      {review.authorName}
                    </p>
                    {review.relativeTime && (
                      <p
                        className="text-xs"
                        style={{ color: colors.foreground, opacity: 0.5 }}
                      >
                        {review.relativeTime}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Google attribution */}
          <p
            className="mt-6 text-center text-xs"
            style={{ color: colors.foreground, opacity: 0.4 }}
          >
            Reviews from Google
          </p>
        </div>
      </section>
    </AnimateSection>
  );
}
