"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function BoldServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-3xl font-black uppercase tracking-wider md:text-4xl" style={{ color: colors.background }}>
            Services
          </h2>
        </AnimateSection>

        {/* Horizontal scroll on mobile, grid on desktop */}
        <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
          {services.map((service, i) => (
            <AnimateSection key={service.name} animation="slide-right" delay={i * 0.1}>
              <div
                className="min-w-[260px] snap-start rounded-xl border-l-4 p-6 md:min-w-0"
                style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
              >
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="text-lg font-bold" style={{ color: colors.foreground }}>
                    {service.name}
                  </h3>
                  <span className="ml-3 whitespace-nowrap font-bold" style={{ color: colors.primary }}>
                    {service.price}
                  </span>
                </div>
                {service.description && (
                  <p className="text-sm opacity-60" style={{ color: colors.foreground }}>
                    {service.description}
                  </p>
                )}
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
