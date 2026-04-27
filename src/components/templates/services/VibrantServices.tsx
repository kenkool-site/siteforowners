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

export function VibrantServices({ services, categories, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

  const renderService = (service: DisplayService, i: number) => {
    const card = (
      <div
        className="rounded-2xl p-6 transition-shadow hover:shadow-lg"
        style={{ background: `linear-gradient(135deg, ${colors.muted}, ${colors.background})` }}
      >
        {service.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={service.image} alt={service.name} className="w-full h-40 object-cover rounded-md mb-3" />
        )}
        <div
          className="mb-3 h-3 w-3 rounded-full"
          style={{ backgroundColor: colors.primary }}
        />
        <h3 className="mb-1 text-base font-bold" style={{ color: rc.textOnMuted }}>
          {service.name}
        </h3>
        {service.description && (
          <p
            className="mb-3 text-sm opacity-60 line-clamp-4"
            style={{ color: rc.textOnMuted }}
          >
            {service.description}
          </p>
        )}
        <span
          className="inline-block rounded-full px-3 py-1 text-sm font-semibold"
          style={{ backgroundColor: `${colors.primary}15`, color: rc.primaryOnMuted }}
        >
          {service.price}
        </span>
        <div className="mt-1 text-xs opacity-70" style={{ color: rc.textOnMuted }}>
          {formatDuration(service.durationMinutes ?? 60)}
        </div>
      </div>
    );
    return (
      <AnimateSection key={service.name} animation="scale-in" delay={i * 0.08}>
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
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-center text-3xl font-bold md:text-4xl" style={{ color: rc.textOnBg }}>
            What We Offer
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
                  <h3
                    className="text-2xl md:text-3xl font-bold"
                    style={{ background: `linear-gradient(90deg, ${colors.primary}, ${rc.textOnBg})`, WebkitBackgroundClip: "text", color: "transparent" }}
                  >
                    {group.label}
                  </h3>
                  <span className="text-sm opacity-60" style={{ color: rc.textOnBg }}>
                    {isCollapsed ? "▸" : "▾"}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
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
