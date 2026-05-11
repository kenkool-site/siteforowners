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

export function VibrantServices({ services, categories, colors, bookingMode, defaultCategoriesCollapsed }: ServicesProps) {
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
      <AnimateSection key={service.name} animation="scale-in" delay={i * 0.08}>
        <div
          className={`rounded-2xl p-6 transition-shadow hover:shadow-lg${canBook ? " cursor-pointer hover:shadow-md" : ""}`}
          style={{ background: `linear-gradient(135deg, ${colors.muted}, ${colors.background})` }}
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
            <div className="relative mb-3 h-40 w-full overflow-hidden rounded-md">
              <Image
                src={service.image}
                alt={service.name}
                fill
                sizes="(max-width: 768px) 50vw, 33vw"
                className="object-cover"
                unoptimized
              />
            </div>
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
          {canBook && (
            <div className="mt-3">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); triggerBook(); }}
                className="w-full rounded-full px-4 py-2 text-sm font-bold shadow-md transition-opacity hover:opacity-95"
                style={{
                  background: `linear-gradient(90deg, ${colors.primary}, ${colors.accent ?? colors.primary})`,
                  color: ctaOnPrimary(colors),
                }}
              >
                Book →
              </button>
            </div>
          )}
        </div>
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
                  className="mb-6 flex w-full items-center gap-4 rounded-2xl border-2 p-4 text-left shadow-md transition-transform hover:scale-[1.01]"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}12, ${colors.muted})`,
                    borderColor: `${colors.primary}35`,
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <span
                      className="mb-0.5 block text-[0.65rem] font-bold uppercase tracking-widest"
                      style={{ color: rc.primaryOnBg }}
                    >
                      Category
                    </span>
                    <span
                      className="mt-1 block text-xl font-bold leading-tight md:text-2xl"
                      style={{
                        background: `linear-gradient(90deg, ${colors.primary}, ${rc.textOnBg})`,
                        WebkitBackgroundClip: "text",
                        color: "transparent",
                      }}
                    >
                      {group.label}
                    </span>
                  </div>
                  <span
                    className="shrink-0 rounded-full px-3 py-1 text-xs font-bold tabular-nums"
                    style={{ backgroundColor: `${colors.primary}22`, color: rc.primaryOnMuted }}
                  >
                    {group.services.length}
                  </span>
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold"
                    style={{ backgroundColor: colors.primary, color: ctaOnPrimary(colors) }}
                    aria-hidden
                  >
                    {isCollapsed ? "›" : "⌄"}
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <>
                  <div className="grid gap-4 grid-cols-2 md:grid-cols-3">
                    {(visibleServices as DisplayService[]).map((service, i) => renderService(service, i))}
                  </div>
                  {group.services.length > INITIAL_SERVICE_LIMIT && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleExpandedGroup(groupKey)}
                        className="rounded-full border px-5 py-2 text-xs font-bold"
                        style={{ borderColor: colors.primary, color: rc.primaryOnBg }}
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
