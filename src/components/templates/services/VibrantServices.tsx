"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string }[];
  colors: ThemeColors;
}

export function VibrantServices({ services, colors }: ServicesProps) {
  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: colors.foreground }}>
            What We Offer
          </h2>
        </AnimateSection>

        <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
          {services.map((service, i) => (
            <AnimateSection key={service.name} animation="scale-in" delay={i * 0.08}>
              <div
                className="rounded-2xl p-6 transition-shadow hover:shadow-lg"
                style={{ background: `linear-gradient(135deg, ${colors.muted}, ${colors.background})` }}
              >
                <div
                  className="mb-3 h-3 w-3 rounded-full"
                  style={{ backgroundColor: colors.primary }}
                />
                <h3 className="mb-1 text-base font-bold" style={{ color: colors.foreground }}>
                  {service.name}
                </h3>
                {service.description && (
                  <p className="mb-3 text-sm opacity-60" style={{ color: colors.foreground }}>
                    {service.description}
                  </p>
                )}
                <span
                  className="inline-block rounded-full px-3 py-1 text-sm font-semibold"
                  style={{ backgroundColor: `${colors.primary}15`, color: colors.primary }}
                >
                  {service.price}
                </span>
              </div>
            </AnimateSection>
          ))}
        </div>
      </div>
    </section>
  );
}
