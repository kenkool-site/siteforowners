"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function WarmServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-2xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-semibold md:text-4xl" style={{ color: colors.foreground }}>
            Our Services
          </h2>
        </AnimateSection>

        <div className="space-y-4">
          {services.map((service, i) => (
            <AnimateSection key={service.name} delay={i * 0.1}>
              <div
                className="rounded-xl border-l-4 p-6"
                style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold" style={{ color: colors.foreground }}>
                      {service.name}
                    </h3>
                    {service.description && (
                      <p className="mt-2 text-base leading-relaxed opacity-70" style={{ color: colors.foreground }}>
                        {service.description}
                      </p>
                    )}
                  </div>
                  <span className="ml-4 text-base font-medium opacity-70" style={{ color: colors.foreground }}>
                    {service.price}
                  </span>
                </div>
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
