"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import type { ThemeColors } from "@/lib/templates/themes";

interface TemplateBookingProps {
  title?: string;
  subtitle?: string;
  bookingUrl?: string;
  phone?: string;
  colors: ThemeColors;
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

// Detect platform from URL and return crop offset (px to hide the welcome banner)
function getBookingPlatform(url: string): { platform: string; cropTop: number } {
  const lower = url.toLowerCase();
  if (lower.includes("acuityscheduling.com") || lower.includes("as.me")) {
    return { platform: "acuity", cropTop: 550 };
  }
  if (lower.includes("calendly.com")) {
    return { platform: "calendly", cropTop: 0 }; // Calendly embeds are already clean
  }
  if (lower.includes("booksy.com")) {
    return { platform: "booksy", cropTop: 300 };
  }
  if (lower.includes("vagaro.com")) {
    return { platform: "vagaro", cropTop: 200 };
  }
  return { platform: "other", cropTop: 0 };
}

export function TemplateBooking({
  title = "Book an Appointment",
  subtitle = "Ready to look your best? Book your appointment today.",
  bookingUrl,
  phone,
  colors,
}: TemplateBookingProps) {
  const [showEmbed, setShowEmbed] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(700);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const canEmbed = bookingUrl && isEmbeddableBookingUrl(bookingUrl);
  const { cropTop } = bookingUrl ? getBookingPlatform(bookingUrl) : { cropTop: 0 };

  // Auto-open embed when navigated to via #booking anchor (from hero CTA)
  useEffect(() => {
    if (!canEmbed) return;
    const handleHash = () => {
      if (window.location.hash === "#booking") {
        setShowEmbed(true);
      }
    };
    handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, [canEmbed]);

  // Listen for Acuity embed sizing messages to auto-size the iframe
  const handleMessage = useCallback((e: MessageEvent) => {
    if (typeof e.data !== "string") return;
    try {
      const msg = JSON.parse(e.data);
      if (msg.height && typeof msg.height === "number") {
        setIframeHeight(Math.max(msg.height - cropTop, 500));
      }
    } catch {
      // Not a JSON message, ignore
    }
  }, [cropTop]);

  useEffect(() => {
    if (!showEmbed) return;
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [showEmbed, handleMessage]);

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

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          {bookingUrl && (
            <Button
              size="lg"
              className="rounded-full px-10 py-6 text-base font-semibold"
              style={{
                backgroundColor: colors.primary,
                color: colors.background,
              }}
              onClick={canEmbed ? () => setShowEmbed(!showEmbed) : undefined}
              asChild={!canEmbed}
            >
              {canEmbed ? (
                <span>{showEmbed ? "Close Booking" : "Book Online"}</span>
              ) : (
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                  Book Online
                </a>
              )}
            </Button>
          )}
          {phone && (
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-10 py-6 text-base font-semibold"
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

        {canEmbed && showEmbed && (
          <div
            className="mt-8 overflow-hidden rounded-2xl shadow-2xl"
            style={{ height: iframeHeight }}
          >
            <iframe
              ref={iframeRef}
              src={bookingUrl}
              title="Book an appointment"
              className="w-full border-0"
              style={{
                height: iframeHeight + cropTop,
                marginTop: -cropTop,
              }}
              allow="payment"
            />
          </div>
        )}
      </div>
    </section>
  );
}
