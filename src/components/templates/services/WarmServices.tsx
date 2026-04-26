"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

type Mode = "in_site_only" | "external_only" | "both";

interface ServicesProps {
  services: { name: string; price: string; description?: string; bookingDeepLink?: string; durationMinutes?: number }[];
  colors: ThemeColors;
  onSelectService?: (bookingDeepLink: string) => void;
  bookingMode?: Mode;
}

export function WarmServices({ services, colors, onSelectService, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-2xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-semibold md:text-4xl" style={{ color: rc.textOnBg }}>
            Our Services
          </h2>
        </AnimateSection>

        <div className="space-y-4">
          {services.map((service, i) => {
            const card = (
              <div
                className="rounded-xl border-l-4 p-6"
                style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold" style={{ color: rc.textOnMuted }}>
                      {service.name}
                    </h3>
                    {service.description && (
                      <p className="mt-2 text-base leading-relaxed opacity-70" style={{ color: rc.textOnMuted }}>
                        {service.description}
                      </p>
                    )}
                  </div>
                  <span className="ml-4 text-base font-medium opacity-70" style={{ color: rc.textOnMuted }}>
                    {service.price}
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
                  if (!onSelectService) return card;
                  return (
                    <button
                      type="button"
                      onClick={() => onSelectService(service.bookingDeepLink ?? "")}
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
