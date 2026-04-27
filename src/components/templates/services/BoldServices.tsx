"use client";

import { useState } from "react";
import type { ThemeColors } from "@/lib/templates/themes";
import type { ServiceItem } from "@/lib/ai/types";
import { readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { formatDuration } from "@/lib/availability";
import { groupServices } from "./groupServices";

type Mode = "in_site_only" | "external_only" | "both";

type DisplayService = {
  name: string;
  price: string;
  description?: string;
  bookingDeepLink?: string;
  durationMinutes?: number;
  image?: string;
  category?: string;
};

interface ServicesProps {
  services: DisplayService[];
  categories?: string[];
  colors: ThemeColors;
  bookingMode?: Mode;
}

export function BoldServices({ services, categories, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderService = (service: DisplayService, i: number) => {
    const card = (
      <div
        className="min-w-[260px] snap-start rounded-xl border-l-4 p-6 md:min-w-0"
        style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
      >
        {service.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.image} alt={service.name} className="w-full h-40 object-cover rounded-md mb-3" />
        )}
        <div className="mb-2 flex items-start justify-between">
          <h3 className="text-lg font-bold" style={{ color: rc.textOnMuted }}>
            {service.name}
          </h3>
          <div className="ml-3 text-right">
            <div className="whitespace-nowrap font-bold" style={{ color: rc.primaryOnMuted }}>
              {service.price}
            </div>
            <div className="text-xs opacity-70" style={{ color: rc.primaryOnMuted }}>
              {formatDuration(service.durationMinutes ?? 60)}
            </div>
          </div>
        </div>
        {service.description && (
          <p
            className="text-sm opacity-60 line-clamp-4"
            style={{ color: rc.textOnMuted }}
          >
            {service.description}
          </p>
        )}
      </div>
    );
    return (
      <AnimateSection key={service.name} animation="slide-right" delay={i * 0.1}>
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
  };

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.foreground }}>
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-3xl font-black uppercase tracking-wider md:text-4xl" style={{ color: rc.textOnFg }}>
            Services
          </h2>
        </AnimateSection>

        {groups.map((group) => {
          const isCollapsed = group.label ? !!collapsed[group.label] : false;
          return (
            <div key={group.label ?? "_flat"} className="mb-8">
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggle(group.label!)}
                  className="w-full mb-4 pb-2 border-b-2 flex items-center justify-between"
                  style={{ borderColor: colors.primary, color: rc.textOnFg }}
                >
                  <span className="text-xs uppercase tracking-[0.2em] font-bold">
                    {group.label}
                  </span>
                  <span className="text-xs opacity-60" aria-hidden>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory md:grid md:grid-cols-3 md:overflow-visible md:pb-0">
                  {(group.services as DisplayService[]).map((service, i) => renderService(service, i))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
