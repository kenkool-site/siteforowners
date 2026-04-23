"use client";

import type { ThemeColors } from "@/lib/templates/themes";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";

interface ServicesProps {
  services: { name: string; price: string; description?: string; appointmentTypeId?: number }[];
  colors: ThemeColors;
}

export function ElegantServices({ services, colors }: ServicesProps) {
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
              <div className="group">
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
            );
            return (
              <AnimateSection key={service.name} animation="fade-in" delay={i * 0.15}>
                {service.appointmentTypeId != null ? (
                  <a href={`#book-${service.appointmentTypeId}`} className="block">
                    {card}
                  </a>
                ) : card}
              </AnimateSection>
            );
          })}
        </div>
      </div>
    </section>
  );
}
