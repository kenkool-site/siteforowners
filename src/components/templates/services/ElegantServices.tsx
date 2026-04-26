"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";

type Mode = "in_site_only" | "external_only" | "both";

interface ServicesProps {
  services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number; image?: string }[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function ElegantServices({ services, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-xl">
        <AnimateSection>
          <h2 className="mb-16 text-center text-3xl font-light md:text-4xl" style={{ color: rc.textOnBg }}>
            Services
          </h2>
        </AnimateSection>

        <div className="space-y-6">
          {services.map((service, i) => {
            const card = (
              <div className="group flex items-start gap-3">
                {service.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={service.image} alt={service.name} className="h-16 w-16 rounded-md object-cover flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-lg font-medium" style={{ color: rc.textOnBg }}>
                      {service.name}
                    </h3>
                    <div className="mx-4 flex-1 border-b border-dotted" style={{ borderColor: `${rc.textOnBg}30` }} />
                    <span className="text-lg" style={{ color: rc.primaryOnBg }}>
                      {service.price}
                    </span>
                  </div>
                  {service.description && (
                    <p className="mt-1 text-sm italic opacity-50" style={{ color: rc.textOnBg }}>
                      {service.description}
                    </p>
                  )}
                </div>
              </div>
            );
            return (
              <AnimateSection key={service.name} animation="fade-in" delay={i * 0.15}>
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
