"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { formatDuration } from "@/lib/availability";

type Mode = "in_site_only" | "external_only" | "both";

interface ServicesProps {
  services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number; image?: string }[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function ClassicServices({ services, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-4xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: rc.textOnBg }}>
            Our Services
          </h2>
        </AnimateSection>
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service, i) => {
            const card = (
              <div
                className="flex items-start justify-between rounded-xl p-5 transition-shadow hover:shadow-md"
                style={{ backgroundColor: colors.muted }}
              >
                {service.image && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={service.image} alt={service.name} className="h-16 w-16 rounded-md object-cover flex-shrink-0 mr-3" />
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold" style={{ color: rc.textOnMuted }}>
                    {service.name}
                  </h3>
                  {service.description && (
                    <p
                      className="mt-1 text-sm opacity-70 line-clamp-4"
                      style={{ color: rc.textOnMuted }}
                    >
                      {service.description}
                    </p>
                  )}
                </div>
                <div className="ml-4 text-right">
                  <span className="whitespace-nowrap text-lg font-bold" style={{ color: rc.primaryOnMuted }}>
                    {service.price}
                  </span>
                  <span className="text-xs opacity-60 ml-2" style={{ color: rc.textOnMuted }}>
                    · {formatDuration(service.durationMinutes ?? 60)}
                  </span>
                </div>
              </div>
            );
            return (
              <AnimateSection key={service.name} delay={i * 0.1}>
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
