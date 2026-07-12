import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale, HomeServicesSectionCopy, HomeServicesServiceArea } from "@/lib/home-services/types";
import type { GoogleReview } from "../TemplateTestimonials";
import { HomeServicesReviews } from "./HomeServicesReviews";
import { HomeServicesServiceAreas } from "./HomeServicesServiceAreas";

export function HomeServicesProofAndAreas({ reviews, areas, rating, reviewCount, coverageSummary, copies, locale, colors }: { reviews: GoogleReview[]; areas: HomeServicesServiceArea[]; rating?: number; reviewCount?: number; coverageSummary: string; copies: { reviews: Required<HomeServicesSectionCopy>; serviceAreas: Required<HomeServicesSectionCopy> }; locale: HomeServicesLocale; colors: ThemeColors }) {
  const hasReviews = reviews.length > 0;
  const hasServiceAreas = areas.length > 0 || Boolean(coverageSummary.trim());
  if (!hasReviews && !hasServiceAreas) return null;
  return <section className="px-4 py-16 sm:px-6" style={{ backgroundColor: colors.muted }}>
    <div className={`mx-auto grid max-w-6xl grid-cols-1 gap-8 ${hasReviews && hasServiceAreas ? "lg:grid-cols-2" : ""}`}>
      {hasReviews && <HomeServicesReviews reviews={reviews} rating={rating} reviewCount={reviewCount} colors={colors} copy={copies.reviews} locale={locale} embedded />}
      {hasServiceAreas && <HomeServicesServiceAreas areas={areas} coverageSummary={coverageSummary} locale={locale} colors={colors} copy={copies.serviceAreas} embedded />}
    </div>
  </section>;
}
