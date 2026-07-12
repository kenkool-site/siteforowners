"use client";

import { useTranslations } from "next-intl";
import type { ThemeColors } from "@/lib/templates/themes";
import type { GoogleReview } from "../TemplateTestimonials";
import { getHomeServicesReadable } from "./home-services-theme";

export interface HomeServicesReviewsProps {
  reviews: GoogleReview[];
  rating?: number;
  reviewCount?: number;
  colors: ThemeColors;
}

function StarRow({ rating, color }: { rating: number; color: string }) {
  return (
    <div className="flex gap-0.5" aria-hidden="true">
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
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function HomeServicesReviews({
  reviews,
  rating,
  reviewCount,
  colors,
}: HomeServicesReviewsProps) {
  const t = useTranslations("homeServices");

  if (reviews.length === 0) {
    return null;
  }

  const readable = getHomeServicesReadable(colors);

  return (
    <section
      id="reviews"
      className="px-4 py-16 sm:px-6"
      style={{ backgroundColor: colors.muted }}
      aria-labelledby="reviews-heading"
    >
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <h2
            id="reviews-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
            style={{ color: readable.headingOnMuted }}
          >
            {t("sections.reviews")}
          </h2>
          {rating && (
            <div className="flex items-center gap-2">
              <StarRow rating={Math.round(rating)} color={readable.headingOnMuted} />
              <span className="text-sm font-medium" style={{ color: readable.bodyOnMuted }}>
                {rating}
                {reviewCount ? ` · ${reviewCount} ${t("reviews.countLabel")}` : ""}
              </span>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {reviews.map((review, index) => (
            <article
              key={`${review.authorName}-${index}`}
              className="rounded-2xl border p-5"
              style={{
                backgroundColor: colors.background,
                borderColor: `${colors.foreground}10`,
              }}
            >
              <StarRow rating={review.rating} color={readable.headingOnBg} />
              <p className="mt-3 text-sm leading-relaxed" style={{ color: readable.bodyOnBg }}>
                &ldquo;{review.text.length > 220 ? `${review.text.slice(0, 220).trim()}...` : review.text}&rdquo;
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                  style={{ backgroundColor: colors.primary, color: readable.avatarOnPrimary }}
                >
                  {getInitials(review.authorName)}
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: readable.bodyOnBg }}>
                    {review.authorName}
                  </p>
                  {review.relativeTime && (
                    <p className="text-xs opacity-60" style={{ color: readable.bodyOnBg }}>
                      {review.relativeTime}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-xs opacity-50" style={{ color: readable.bodyOnMuted }}>
          {t("reviews.attribution")}
        </p>
      </div>
    </section>
  );
}
