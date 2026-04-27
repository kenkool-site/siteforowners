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

export function ElegantServices({ services, categories, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderService = (service: DisplayService, i: number) => {
    const card = (
      <div className="group space-y-2">
        {service.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={service.image}
            alt={service.name}
            className="block h-32 w-full rounded-md object-cover"
          />
        )}
        <div>
          <div className="flex items-baseline">
            <h3 className="text-lg font-medium" style={{ color: rc.textOnBg }}>
              {service.name}
            </h3>
            <div className="mx-4 flex-1 border-b border-dotted" style={{ borderColor: `${rc.textOnBg}30` }} />
            <div className="text-right">
              <span className="text-lg" style={{ color: rc.primaryOnBg }}>
                {service.price}
              </span>
              <span className="text-xs opacity-60 ml-2" style={{ color: rc.textOnBg }}>
                · {formatDuration(service.durationMinutes ?? 60)}
              </span>
            </div>
          </div>
          {service.description && (
            <p
              className="mt-1 text-sm italic opacity-50 line-clamp-3"
              style={{ color: rc.textOnBg }}
            >
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
  };

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-xl">
        <AnimateSection>
          <h2 className="mb-16 text-center text-3xl font-light md:text-4xl" style={{ color: rc.textOnBg }}>
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
                  className="w-full flex items-center justify-between mb-6"
                >
                  <span
                    className="text-[10px] uppercase font-light tracking-[0.4em]"
                    style={{ color: rc.textOnBg }}
                  >
                    {group.label}
                  </span>
                  <span className="text-[10px] opacity-50" style={{ color: rc.textOnBg }}>
                    {isCollapsed ? "+" : "−"}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <div className="space-y-6">
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
