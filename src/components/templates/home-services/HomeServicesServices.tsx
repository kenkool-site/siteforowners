"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import type { ServiceItem } from "@/lib/ai/types";
import type { ThemeColors } from "@/lib/templates/themes";
import type { HomeServicesLocale } from "@/lib/home-services/types";
import { getHomeServicesReadable } from "./home-services-theme";

export interface HomeServicesServicesProps {
  services: ServiceItem[];
  serviceDescriptions: Record<string, string>;
  locale: HomeServicesLocale;
  colors: ThemeColors;
  onEstimate: (serviceName?: string) => void;
}

function serviceDescriptionKey(service: ServiceItem): string {
  return service.client_id || service.name;
}

export function HomeServicesServices({
  services,
  serviceDescriptions,
  colors,
  onEstimate,
}: HomeServicesServicesProps) {
  const t = useTranslations("homeServices");
  const readable = getHomeServicesReadable(colors);

  if (services.length === 0) {
    return null;
  }

  return (
    <section
      id="services"
      className="px-4 py-16 sm:px-6"
      style={{ backgroundColor: colors.background }}
      aria-labelledby="services-heading"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="services-heading"
          className="mb-8 text-2xl font-bold tracking-tight sm:text-3xl"
          style={{ color: readable.headingOnBg }}
        >
          {t("sections.services")}
        </h2>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => {
            const description =
              serviceDescriptions[serviceDescriptionKey(service)] ||
              serviceDescriptions[service.name] ||
              service.description ||
              "";
            return (
              <button type="button"
                key={service.client_id || service.name}
                onClick={() => onEstimate(service.name)}
                className="text-left group flex min-h-11 flex-col overflow-hidden rounded-2xl border transition-shadow hover:shadow-md"
                style={{
                  backgroundColor: colors.muted,
                  borderColor: `${colors.foreground}10`,
                }}
              >
                {service.image && (
                  <div className="relative aspect-[16/10] w-full overflow-hidden">
                    <Image
                      src={service.image}
                      alt=""
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      unoptimized
                    />
                  </div>
                )}
                <div className="flex flex-1 flex-col gap-2 p-5">
                  <h3 className="text-lg font-semibold" style={{ color: readable.cardHeadingOnMuted }}>
                    {service.name}
                  </h3>
                  {description && (
                    <p className="text-sm leading-relaxed" style={{ color: readable.cardBodyOnMuted }}>
                      {description}
                    </p>
                  )}
                  <span
                    className="mt-auto inline-flex min-h-11 items-center text-sm font-semibold"
                    style={{ color: readable.estimateLinkOnMuted }}
                  >
                    {t("actions.freeEstimate")} →
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
