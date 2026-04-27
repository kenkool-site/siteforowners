"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";
import type { AddOn } from "@/lib/ai/types";
import { CustomerBookingFlow, MockBookingCalendar } from "./CustomerBookingFlow";

interface BookingService {
  name: string;
  price: string;
  duration: string;
  id: number;
  image?: string;
  /**
   * Fully-resolved deep-link URL for this specific service. When present
   * and `onSelectService` is provided, the per-service Book button opens
   * the in-site modal with this URL; otherwise it falls back to opening
   * `directUrl` in a new tab.
   */
  deepLinkUrl?: string;
}

interface BookingCategory {
  name: string;
  services: BookingService[];
  directUrl: string;
}

interface SimpleService {
  name: string;
  price: string;
  durationMinutes?: number;  // optional, defaults to 60 throughout the flow
  description?: string;
  image?: string;
  addOns?: AddOn[];
}

interface TemplateBookingProps {
  title?: string;
  subtitle?: string;
  bookingUrl?: string;
  phone?: string;
  colors: ThemeColors;
  bookingCategories?: BookingCategory[];
  services?: SimpleService[];
  businessName?: string;
  previewSlug?: string;
  isLive?: boolean; // true when rendered on published site (not preview)
  /**
   * If provided, the per-service Book button opens the in-site booking
   * modal (deep-linked to the service) instead of opening a new tab.
   */
  onSelectService?: (deepLinkUrl: string) => void;
  /** v2: drives the dual-mode entry CTA. Defaults to legacy behavior when absent. */
  bookingMode?:
    | { mode: "in_site_only" }
    | { mode: "external_only"; url: string; providerName: string }
    | { mode: "both"; url: string; providerName: string };
  /** Per-weekday open/close (or null for closed). Used by the in-site
   * date picker to grey out closed weekdays. */
  workingHours?: Record<string, { open: string; close: string } | null> | null;
  /** ISO date strings (YYYY-MM-DD) the tenant has blocked off. */
  blockedDates?: string[];
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
  services,
  businessName = "Our Business",
  previewSlug,
  isLive = false,
  onSelectService,
  bookingMode,
  workingHours = null,
  blockedDates = [],
}: TemplateBookingProps) {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [showFallbackEmbed, setShowFallbackEmbed] = useState(false);
  const [showBookingCalendar, setShowBookingCalendar] = useState(false);
  const hasCategories = bookingCategories && bookingCategories.length > 0;
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);
  const showInternalBooking = !bookingUrl && !hasCategories && services && services.length > 0;

  // Compute effective mode. If `bookingMode` prop is provided, trust it.
  // Otherwise fall back to legacy logic so existing callers without the
  // prop still work (preview/marketing pages).
  const effectiveMode: "in_site_only" | "external_only" | "both" =
    bookingMode?.mode
    ?? (bookingUrl ? "external_only" : "in_site_only");

  // Auto-open when navigated to via #booking anchor
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === "#booking") {
        if (hasCategories) {
          setExpandedCategory(bookingCategories![0].name);
        } else if (effectiveMode === "in_site_only" || effectiveMode === "both") {
          setShowBookingCalendar(true);
        } else if (canEmbed) {
          setShowFallbackEmbed(true);
        } else if (showInternalBooking) {
          setShowBookingCalendar(true);
        }
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [hasCategories, canEmbed, showInternalBooking, bookingCategories, effectiveMode]);

  // External trigger: per-service "Book Now" buttons in the Services section
  // dispatch this event to open the in-site booking calendar (in_site_only and
  // both modes). The event detail may carry a `serviceName` so the calendar
  // can preselect the service the customer just clicked, jumping straight to
  // the date step instead of repeating the service-selection step.
  const [pendingServiceName, setPendingServiceName] = useState<string | null>(null);
  useEffect(() => {
    if (effectiveMode !== "in_site_only" && effectiveMode !== "both") return;
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent).detail as { serviceName?: string } | undefined;
      setPendingServiceName(detail?.serviceName ?? null);
      setShowBookingCalendar(true);
    };
    window.addEventListener("siteforowners:open-booking-calendar", handleOpen);
    return () => window.removeEventListener("siteforowners:open-booking-calendar", handleOpen);
  }, [effectiveMode]);

  // Resolve pending name to a service object so the calendar can preselect it.
  const initialService = pendingServiceName && services
    ? services.find((s) => s.name === pendingServiceName) ?? null
    : null;

  // In `both` mode, per-service Book buttons with a deep link request a
  // choice between in-site and external first (mirrors the main entry CTA
  // dual options). State + listener owned here so a single dialog instance
  // serves all services without a per-service mount.
  const [bookingChoice, setBookingChoice] = useState<{ serviceName: string; deepLink: string } | null>(null);
  useEffect(() => {
    if (effectiveMode !== "both") return;
    const handleRequest = (e: Event) => {
      const detail = (e as CustomEvent).detail as { serviceName: string; deepLink: string } | undefined;
      if (detail?.serviceName && detail.deepLink) {
        setBookingChoice({ serviceName: detail.serviceName, deepLink: detail.deepLink });
      }
    };
    window.addEventListener("siteforowners:request-booking-choice", handleRequest);
    return () => window.removeEventListener("siteforowners:request-booking-choice", handleRequest);
  }, [effectiveMode]);

  const choiceProviderName =
    bookingMode?.mode === "both" ? bookingMode.providerName : "your booking provider";

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

        {/* Native category/service booking UI — only the legacy
            Acuity-driven entry path. In `both` and `in_site_only` modes the
            new Layout A / primary-button rendering below takes precedence
            so the dual booking options stay visible even when Acuity
            categories were previously imported. */}
        {hasCategories && effectiveMode === "external_only" ? (
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
                            className="flex items-center justify-between gap-4 border-b border-white/5 py-4 last:border-0"
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-3">
                              {service.image && (
                                <img
                                  src={service.image}
                                  alt=""
                                  loading="lazy"
                                  className="h-14 w-14 flex-shrink-0 rounded-lg object-cover sm:h-16 sm:w-16"
                                />
                              )}
                              <div className="min-w-0">
                                <p
                                  className="truncate font-medium"
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
                            </div>
                            {onSelectService && service.deepLinkUrl ? (
                              <Button
                                size="sm"
                                className="rounded-full px-6 text-sm font-semibold"
                                style={{
                                  backgroundColor: colors.primary,
                                  color: colors.background,
                                }}
                                onClick={() => onSelectService(service.deepLinkUrl!)}
                              >
                                Book
                              </Button>
                            ) : (
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
                                  href={service.deepLinkUrl ?? category.directUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Book
                                </a>
                              </Button>
                            )}
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
          /* Fallback: buttons + iframe embed or mock calendar */
          <>
            {effectiveMode === "both" ? (
              /* Layout A: primary in-site button + quiet external link */
              <div className="space-y-3">
                <Button
                  onClick={() => setShowBookingCalendar(true)}
                  className="w-full rounded-xl py-5 text-base font-semibold"
                  style={{ background: colors.primary, color: colors.background }}
                >
                  Book instantly on this website →
                </Button>
                <p className="text-center text-xs opacity-70" style={{ color: colors.background }}>
                  Already using {bookingMode?.mode === "both" ? bookingMode.providerName : "your booking provider"}?{" "}
                  <a
                    href={bookingMode?.mode === "both" ? bookingMode.url : "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: colors.primary }}
                  >
                    You can still book there ↗
                  </a>
                </p>
              </div>
            ) : effectiveMode === "in_site_only" ? (
              /* In-site only: primary button opens booking calendar */
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                {services && services.length > 0 ? (
                  <Button
                    size="lg"
                    className="rounded-full px-10 py-6 text-base font-semibold"
                    style={{
                      backgroundColor: colors.primary,
                      color: colors.background,
                    }}
                    onClick={() => setShowBookingCalendar(true)}
                  >
                    Book instantly on this website →
                  </Button>
                ) : (
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
              </div>
            ) : (
              /* external_only: legacy behavior — render the external embed/redirect */
              <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
                {bookingUrl ? (
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
                ) : showInternalBooking ? (
                  <Button
                    size="lg"
                    className="rounded-full px-10 py-6 text-base font-semibold"
                    style={{
                      backgroundColor: colors.primary,
                      color: colors.background,
                    }}
                    onClick={() => setShowBookingCalendar(true)}
                  >
                    Book Online
                  </Button>
                ) : null}
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
                {!bookingUrl && !phone && !showInternalBooking && (
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
            )}

            {canEmbed && showFallbackEmbed && (
              <div className="mt-8 overflow-hidden rounded-2xl shadow-2xl" style={{ height: 800 }}>
                <iframe
                  src={getEmbedUrl(bookingUrl!)}
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

      {/* Booking calendar popup */}
      <AnimatePresence>
        {showBookingCalendar && services && services.length > 0 && (
          isLive && previewSlug ? (
            <CustomerBookingFlow
              services={services}
              colors={colors}
              businessName={businessName}
              previewSlug={previewSlug}
              onClose={() => {
                setShowBookingCalendar(false);
                setPendingServiceName(null);
              }}
              initialService={initialService}
              workingHours={workingHours}
              blockedDates={blockedDates}
            />
          ) : (
            <MockBookingCalendar
              services={services}
              colors={colors}
              businessName={businessName}
              onClose={() => {
                setShowBookingCalendar(false);
                setPendingServiceName(null);
              }}
              initialService={initialService}
            />
          )
        )}
      </AnimatePresence>

      {/* Booking choice dialog — `both` mode + deep link only. Mirrors the
          main entry CTA's dual options (primary in-site, secondary external)
          for per-service clicks. */}
      <AnimatePresence>
        {bookingChoice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
            onClick={() => setBookingChoice(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-full max-w-sm rounded-t-2xl sm:rounded-2xl p-5"
              style={{ backgroundColor: colors.background }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-xs font-medium uppercase tracking-wider opacity-60 mb-1" style={{ color: colors.foreground }}>
                {bookingChoice.serviceName}
              </div>
              <h3 className="text-lg font-bold mb-4" style={{ color: colors.foreground }}>
                How would you like to book?
              </h3>

              <Button
                onClick={() => {
                  const name = bookingChoice.serviceName;
                  setBookingChoice(null);
                  // Defer to the existing in-site flow so the calendar can
                  // pick up the preselected service via the same channel
                  // /admin/Services use.
                  setTimeout(() => {
                    document.getElementById("booking")?.scrollIntoView({ behavior: "smooth" });
                    window.dispatchEvent(
                      new CustomEvent("siteforowners:open-booking-calendar", {
                        detail: { serviceName: name },
                      }),
                    );
                  }, 0);
                }}
                className="w-full rounded-xl py-5 text-base font-semibold"
                style={{ background: colors.primary, color: colors.background }}
              >
                Book instantly on this website →
              </Button>

              <a
                href={bookingChoice.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setBookingChoice(null)}
                className="block text-center mt-3 text-xs underline opacity-70"
                style={{ color: colors.primary }}
              >
                Or continue with {choiceProviderName} ↗
              </a>

              <button
                type="button"
                onClick={() => setBookingChoice(null)}
                className="block w-full text-center mt-4 text-xs opacity-50"
                style={{ color: colors.foreground }}
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
