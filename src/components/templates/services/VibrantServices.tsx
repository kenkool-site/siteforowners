"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";

type Mode = "in_site_only" | "external_only" | "both";

interface ServicesProps {
  services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number }[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function VibrantServices({ services, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: rc.textOnBg }}>
            What We Offer
          </h2>
        </AnimateSection>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
          {services.map((service, i) => {
            const card = (
              <div
                className="rounded-2xl p-6 transition-shadow hover:shadow-lg"
                style={{ background: `linear-gradient(135deg, ${colors.muted}, ${colors.background})` }}
              >
                <div
                  className="mb-3 h-3 w-3 rounded-full"
                  style={{ backgroundColor: colors.primary }}
                />
                <h3 className="mb-1 text-base font-bold" style={{ color: rc.textOnMuted }}>
                  {service.name}
                </h3>
                {service.description && (
                  <p className="mb-3 text-sm opacity-60" style={{ color: rc.textOnMuted }}>
                    {service.description}
                  </p>
                )}
                <span
                  className="inline-block rounded-full px-3 py-1 text-sm font-semibold"
                  style={{ backgroundColor: `${colors.primary}15`, color: rc.primaryOnMuted }}
                >
                  {service.price}
                </span>
              </div>
            );
            return (
              <AnimateSection key={service.name} animation="scale-in" delay={i * 0.08}>
                {(() => {
                  const m = bookingMode ?? "in_site_only";
                  if (m === "external_only") {
                    if (!service.bookingDeepLink) return card;
                    return (
                      <button
                        type="button"
                        onClick={() => window.open(service.bookingDeepLink!, "_blank", "noopener,noreferrer")}
                        className="block w-full text-left"
                      >
                        {card}
                      </button>
                    );
                  }
                  if (m === "both" && service.bookingDeepLink) {
                    return (
                      <button
                        type="button"
                        onClick={() => requestBookingChoice(service.name, service.bookingDeepLink!)}
                        className="block w-full text-left"
                      >
                        {card}
                      </button>
                    );
                  }
                  return (
                    <button
                      type="button"
                      onClick={() => openBookingCalendarForService(service.name)}
                      className="block w-full text-left"
                    >
                      {card}
                    </button>
                  );
                })()}
              </AnimateSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}
