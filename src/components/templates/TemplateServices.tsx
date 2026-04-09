"use client";

import type { ThemeColors } from "@/lib/templates/themes";

interface Service {
  name: string;
  price: string;
  description?: string;
}

interface TemplateServicesProps {
  title?: string;
  services: Service[];
  colors: ThemeColors;
}

export function TemplateServices({
  title = "Our Services",
  services,
  colors,
}: TemplateServicesProps) {
  return (
    <section
      className="px-6 py-20"
      style={{ backgroundColor: colors.background }}
    >
      <div className="mx-auto max-w-4xl">
        <h2
          className="mb-12 text-center text-3xl font-bold md:text-4xl"
          style={{ color: colors.foreground }}
        >
          {title}
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <div
              key={service.name}
              className="flex items-start justify-between rounded-xl p-5 transition-shadow hover:shadow-md"
              style={{ backgroundColor: colors.muted }}
            >
              <div className="flex-1">
                <h3
                  className="text-lg font-semibold"
                  style={{ color: colors.foreground }}
                >
                  {service.name}
                </h3>
                {service.description && (
                  <p
                    className="mt-1 text-sm opacity-70"
                    style={{ color: colors.foreground }}
                  >
                    {service.description}
                  </p>
                )}
              </div>
              <span
                className="ml-4 whitespace-nowrap text-lg font-bold"
                style={{ color: colors.primary }}
              >
                {service.price}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
