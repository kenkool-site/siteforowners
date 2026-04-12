"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface BookingService {
  name: string;
  price: string;
  duration: string;
  id: number;
}

interface BookingCategory {
  name: string;
  services: BookingService[];
  directUrl: string;
}

interface TemplateBookingProps {
  title?: string;
  subtitle?: string;
  bookingUrl?: string;
  phone?: string;
  colors: ThemeColors;
  bookingCategories?: BookingCategory[];
}

// For Vagaro URLs, ensure the embed loads the /services page directly
function getEmbedUrl(url: string): string {
  if (url.toLowerCase().includes("vagaro.com")) {
    const base = url.replace(/\/+$/, "").replace(/\/(services|about|staff)$/i, "");
    return `${base}/services`;
  }
  return url;
}

export function isEmbeddableBookingUrl(url: string): boolean {
  const embeddablePatterns = [
    "booksy.com",
    "vagaro.com",
    "squareup.com",
    "square.site",
    "acuityscheduling.com",
    "as.me",
    "calendly.com",
    "cal.com",
  ];
  return embeddablePatterns.some((pattern) =>
    url.toLowerCase().includes(pattern)
  );
}

export function TemplateBooking({
  title = "Book an Appointment",
  subtitle = "Ready to look your best? Book your appointment today.",
  bookingUrl,
  phone,
  colors,
  bookingCategories,
}: TemplateBookingProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showFallbackEmbed, setShowFallbackEmbed] = useState(false);
  const hasCategories = bookingCategories && bookingCategories.length > 0;
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);

  // Auto-open when navigated to via #booking anchor
  useEffect(() => {
    if (!hasCategories && !canEmbed) return;
    const handleHash = () => {
      if (window.location.hash === "#booking") {
        if (hasCategories) {
          // Auto-expand first category
          setExpandedCategory(bookingCategories[0].name);
        } else {
          setShowFallbackEmbed(true);
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [hasCategories, canEmbed, bookingCategories]);

  return (
    <section
      id="booking"
      className="px-6 py-20"
      style={{ backgroundColor: colors.foreground }}
    >
      <div className="mx-auto max-w-3xl text-center">
        <h2
          className="mb-4 text-3xl font-bold md:text-4xl"
          style={{ color: colors.background }}
        >
          {title}
        </h2>
        <p className="mb-10 text-lg opacity-80" style={{ color: colors.background }}>
          {subtitle}
        </p>

        {/* Native category/service booking UI */}
        {hasCategories ? (
          <div className="space-y-3 text-left">
            {bookingCategories.map((category) => (
              <div
                key={category.name}
                className="overflow-hidden rounded-xl"
                style={{ backgroundColor: `${colors.background}10` }}
              >
                {/* Category header */}
                <button
                  onClick={() =>
                    setExpandedCategory(
                      expandedCategory === category.name ? null : category.name
                    )
                  }
                  className="flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-white/10"
                >
                  <span
                    className="text-lg font-semibold"
                    style={{ color: colors.background }}
                  >
                    {category.name}
                  </span>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-sm opacity-60"
                      style={{ color: colors.background }}
                    >
                      {category.services.length}{" "}
                      {category.services.length === 1 ? "service" : "services"}
                    </span>
                    <svg
                      className="h-5 w-5 transition-transform"
                      style={{
                        color: colors.primary,
                        transform:
                          expandedCategory === category.name
                            ? "rotate(180deg)"
                            : "rotate(0deg)",
                      }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                </button>

                {/* Expanded services */}
                <AnimatePresence>
                  {expandedCategory === category.name && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      <div className="border-t border-white/10 px-6 pb-4 pt-2">
                        {category.services.map((service) => (
                          <div
                            key={service.id}
                            className="flex items-center justify-between border-b border-white/5 py-4 last:border-0"
                          >
                            <div>
                              <p
                                className="font-medium"
                                style={{ color: colors.background }}
                              >
                                {service.name}
                              </p>
                              <p
                                className="mt-1 text-sm opacity-50"
                                style={{ color: colors.background }}
                              >
                                {service.duration} &middot; {service.price}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              className="rounded-full px-6 text-sm font-semibold"
                              style={{
                                backgroundColor: colors.primary,
                                color: colors.background,
                              }}
                              asChild
                            >
                              <a
                                href={category.directUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Book
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}

            {/* Fallback: direct link to full booking page */}
            {bookingUrl && (
              <div className="pt-4 text-center">
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm underline opacity-60 transition-opacity hover:opacity-100"
                  style={{ color: colors.primary }}
                >
                  View all options on booking page
                </a>
              </div>
            )}
          </div>
        ) : (
          /* Fallback: buttons + iframe embed for non-Acuity or when no categories */
          <>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              {bookingUrl && (
                <Button
                  size="lg"
                  className="rounded-full px-10 py-6 text-base font-semibold"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                  }}
                  onClick={
                    canEmbed
                      ? () => setShowFallbackEmbed(!showFallbackEmbed)
                      : undefined
                  }
                  asChild={!canEmbed}
                >
                  {canEmbed ? (
                    <span>
                      {showFallbackEmbed ? "Close Booking" : "Book Online"}
                    </span>
                  ) : (
                    <a
                      href={bookingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Book Online
                    </a>
                  )}
                </Button>
              )}
              {phone && (
                <Button
                  size="lg"
                  variant="outline"
                  className="rounded-full !bg-transparent px-10 py-6 text-base font-semibold"
                  style={{
                    borderColor: colors.primary,
                    color: colors.primary,
                  }}
                  asChild
                >
                  <a href={`tel:${phone}`}>Call {phone}</a>
                </Button>
              )}
              {!bookingUrl && !phone && (
                <Button
                  size="lg"
                  className="rounded-full px-10 py-6 text-base font-semibold"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.background,
                  }}
                >
                  Contact Us
                </Button>
              )}
            </div>

            {canEmbed && showFallbackEmbed && (
              <div className="mt-8 overflow-hidden rounded-2xl shadow-2xl" style={{ height: 800 }}>
                <iframe
                  src={getEmbedUrl(bookingUrl)}
                  title="Book an appointment"
                  className="w-full border-0"
                  style={{ height: 1600, marginTop: -200 }}
                  allow="payment"
                />
              </div>
            )}
          </>
        )}

        {/* Phone CTA when categories are shown */}
        {hasCategories && phone && (
          <div className="mt-8">
            <Button
              size="lg"
              variant="outline"
              className="rounded-full !bg-transparent px-10 py-6 text-base font-semibold"
              style={{
                borderColor: colors.primary,
                color: colors.primary,
              }}
              asChild
            >
              <a href={`tel:${phone}`}>Or call {phone}</a>
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
