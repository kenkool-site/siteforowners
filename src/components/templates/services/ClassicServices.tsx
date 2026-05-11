"use client";

import { useState } from "react";
import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import type { ServiceItem } from "@/lib/ai/types";
import { ctaOnPrimary, readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { formatDuration } from "@/lib/availability";
import { useServiceCategoryCollapse } from "./useServiceCategoryCollapse";

type Mode = "in_site_only" | "external_only" | "both";

const INITIAL_SERVICE_LIMIT = 9;

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
  defaultCategoriesCollapsed?: boolean;
}

export function ClassicServices({ services, categories, colors, bookingMode, defaultCategoriesCollapsed }: ServicesProps) {
  const rc = readableColors(colors);
  const { groups, collapsed, toggle } = useServiceCategoryCollapse(
    services as unknown as ServiceItem[],
    categories,
    defaultCategoriesCollapsed,
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleExpandedGroup = (label: string) =>
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

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
            <div className="relative w-32 self-stretch flex-shrink-0 overflow-hidden">
              <Image
                src={service.image}
                alt={service.name}
                fill
                sizes="128px"
                className="object-cover"
                unoptimized
              />
            </div>
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
                  className="rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm transition-opacity hover:opacity-90"
                  style={{ backgroundColor: colors.primary, color: ctaOnPrimary(colors) }}
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
          const groupKey = group.label ?? "_flat";
          const isCollapsed = group.label ? !!collapsed[group.label] : false;
          const shouldLimitGroup = group.services.length > INITIAL_SERVICE_LIMIT && !expandedGroups[groupKey];
          const visibleServices = shouldLimitGroup
            ? group.services.slice(0, INITIAL_SERVICE_LIMIT)
            : group.services;
          return (
            <div key={groupKey} className="mb-8">
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggle(group.label!)}
                  aria-expanded={!isCollapsed}
                  className="mb-5 flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left shadow-sm transition-shadow hover:shadow-md"
                  style={{
                    backgroundColor: colors.muted,
                    borderColor: `${colors.primary}30`,
                    borderLeftWidth: 4,
                    borderLeftColor: colors.primary,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <span
                      className="mb-0.5 block text-[0.65rem] font-bold uppercase tracking-[0.2em]"
                      style={{ color: rc.primaryOnMuted }}
                    >
                      Category
                    </span>
                    <span
                      className="font-serif text-lg font-semibold italic leading-tight md:text-xl"
                      style={{ color: rc.textOnMuted }}
                    >
                      {group.label}
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums"
                    style={{
                      backgroundColor: `${colors.primary}18`,
                      color: rc.primaryOnMuted,
                    }}
                  >
                    {group.services.length}{" "}
                    {group.services.length === 1 ? "service" : "services"}
                  </span>
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold leading-none"
                    style={{
                      backgroundColor: `${colors.primary}15`,
                      color: colors.primary,
                    }}
                    aria-hidden
                  >
                    {isCollapsed ? "›" : "⌄"}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    {(visibleServices as DisplayService[]).map((service, i) => renderService(service, i))}
                  </div>
                  {group.services.length > INITIAL_SERVICE_LIMIT && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleExpandedGroup(groupKey)}
                        className="rounded-full border px-5 py-2 text-xs font-semibold"
                        style={{ borderColor: colors.primary, color: colors.primary }}
                      >
                        {expandedGroups[groupKey]
                          ? "Show featured services"
                          : <>View all {group.services.length} services</>}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
