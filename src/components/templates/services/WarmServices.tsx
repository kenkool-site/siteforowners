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

export function WarmServices({ services, categories, colors, bookingMode }: ServicesProps) {
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
          className={`flex overflow-hidden rounded-xl border-l-4 ${canBook ? "cursor-pointer transition-shadow hover:shadow-md" : ""}`}
          style={{ backgroundColor: colors.muted, borderLeftColor: colors.primary }}
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
          <div className="flex-1 min-w-0 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold leading-tight" style={{ color: rc.textOnMuted }}>
                {service.name}
              </h3>
              <div className="flex-shrink-0 whitespace-nowrap text-right text-sm" style={{ color: rc.textOnMuted }}>
                <span className="font-semibold">{service.price}</span>
                <span className="opacity-60"> · {formatDuration(service.durationMinutes ?? 60)}</span>
              </div>
            </div>
            {service.description && (
              <p
                className="mt-1 text-sm leading-snug opacity-70 line-clamp-4"
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
                  className="rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm"
                  style={{ backgroundColor: colors.primary, color: "#fff" }}
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
      <div className="mx-auto max-w-2xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-semibold md:text-4xl" style={{ color: rc.textOnBg }}>
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
                  className="mb-4 inline-flex items-center gap-2"
                >
                  <span
                    className="rounded-full px-4 py-1 text-xs font-semibold"
                    style={{ backgroundColor: colors.primary, color: "#fff" }}
                  >
                    {group.label}
                  </span>
                  <span className="text-xs opacity-60" style={{ color: rc.textOnBg }}>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <div className="space-y-4">
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
