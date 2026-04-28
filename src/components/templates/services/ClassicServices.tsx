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

export function ClassicServices({ services, categories, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderService = (service: DisplayService, i: number) => {
    const m = bookingMode ?? "in_site_only";
    const canBook = !(m === "external_only" && !service.bookingDeepLink);
    const triggerBook = () => {
      if (m === "external_only" && service.bookingDeepLink) {
        window.open(service.bookingDeepLink, "_blank", "noopener,noreferrer");
      } else if (m === "both" && service.bookingDeepLink) {
        requestBookingChoice(service.name, service.bookingDeepLink);
      } else {
        openBookingCalendarForService(service.name);
      }
    };
    return (
      <AnimateSection key={service.name} delay={i * 0.1}>
        <div
          className={`flex overflow-hidden rounded-xl transition-shadow hover:shadow-md${canBook ? " cursor-pointer" : ""}`}
          style={{ backgroundColor: colors.muted }}
          {...(canBook
            ? {
                role: "button",
                tabIndex: 0,
                onClick: triggerBook,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    triggerBook();
                  }
                },
              }
            : {})}
        >
          {service.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.image}
              alt={service.name}
              className="block w-32 self-stretch flex-shrink-0 object-cover"
            />
          )}
          <div className="flex-1 min-w-0 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-lg font-semibold" style={{ color: rc.textOnMuted }}>
                {service.name}
              </h3>
              <div className="flex-shrink-0 whitespace-nowrap text-right">
                <span className="text-lg font-bold" style={{ color: rc.primaryOnMuted }}>
                  {service.price}
                </span>
                <span className="ml-2 text-xs opacity-60" style={{ color: rc.textOnMuted }}>
                  · {formatDuration(service.durationMinutes ?? 60)}
                </span>
              </div>
            </div>
            {service.description && (
              <p
                className="mt-1 text-sm opacity-70 line-clamp-4"
                style={{ color: rc.textOnMuted }}
              >
                {service.description}
              </p>
            )}
            {canBook && (
              <div className="mt-3 flex justify-end">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); triggerBook(); }}
                  className="rounded-full border px-4 py-1.5 text-xs font-semibold"
                  style={{ borderColor: colors.primary, color: colors.primary }}
                >
                  Book →
                </button>
              </div>
            )}
          </div>
        </div>
      </AnimateSection>
    );
  };

  return (
    <section className="px-6 py-20" style={{ backgroundColor: colors.background }}>
      <div className="mx-auto max-w-4xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: rc.textOnBg }}>
            Our Services
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
                  className="w-full mb-5 flex items-center gap-3"
                >
                  <span className="flex-1 border-t border-current opacity-30" aria-hidden />
                  <span className="font-serif italic text-base" style={{ color: rc.textOnBg }}>
                    {group.label}
                  </span>
                  <span className="text-xs opacity-60" style={{ color: rc.textOnBg }}>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                  <span className="flex-1 border-t border-current opacity-30" aria-hidden />
                </button>
              )}
              {!isCollapsed && (
                <div className="grid gap-4 md:grid-cols-2">
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
