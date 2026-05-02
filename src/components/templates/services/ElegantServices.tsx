"use client";

import { useState } from "react";
import Image from "next/image";
import type { ThemeColors } from "@/lib/templates/themes";
import type { ServiceItem } from "@/lib/ai/types";
import { ctaOnPrimary, readableColors } from "@/lib/templates/contrast";
import { AnimateSection } from "../shared/AnimateSection";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { formatDuration } from "@/lib/availability";
import { groupServices } from "./groupServices";

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
}

export function ElegantServices({ services, categories, colors, bookingMode }: ServicesProps) {
  const rc = readableColors(colors);
  const groups = groupServices(services as unknown as ServiceItem[], categories);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggle = (label: string) =>
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));

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
      <AnimateSection key={service.name} animation="fade-in" delay={i * 0.15}>
        <div
          className={`group flex items-stretch gap-4${canBook ? " cursor-pointer" : ""}`}
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
            <div className="relative w-32 self-stretch flex-shrink-0 overflow-hidden rounded-md">
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
          <div className="flex-1 min-w-0">
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
                className="mt-1 text-sm italic opacity-50 line-clamp-4"
                style={{ color: rc.textOnBg }}
              >
                {service.description}
              </p>
            )}
            {canBook && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); triggerBook(); }}
                  className="inline-flex px-4 py-2 text-[10px] font-light uppercase tracking-[0.28em] transition-opacity hover:opacity-90"
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
      <div className="mx-auto max-w-xl">
        <AnimateSection>
          <h2 className="mb-16 text-center text-3xl font-light md:text-4xl" style={{ color: rc.textOnBg }}>
            Services
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
                  className="mb-6 flex w-full items-center justify-between gap-4 border-y py-4"
                  style={{ borderColor: `${rc.textOnBg}20` }}
                >
                  <div className="min-w-0 text-left">
                    <span
                      className="block text-[10px] font-light uppercase tracking-[0.35em] opacity-60"
                      style={{ color: rc.textOnBg }}
                    >
                      Category
                    </span>
                    <span
                      className="mt-1 block text-xl font-light md:text-2xl"
                      style={{ color: rc.textOnBg }}
                    >
                      {group.label}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className="shrink-0 px-2 py-1.5 text-[9px] font-light uppercase tracking-[0.2em] sm:px-3 sm:text-[10px]"
                      style={{
                        border: `1px solid ${rc.primaryOnBg}`,
                        color: rc.primaryOnBg,
                      }}
                    >
                      {group.services.length}{" "}
                      {group.services.length === 1 ? "service" : "services"}
                    </span>
                    <span
                      className="flex h-9 w-9 items-center justify-center border text-sm font-light"
                      style={{ borderColor: `${rc.primaryOnBg}99`, color: rc.primaryOnBg }}
                      aria-hidden
                    >
                      {isCollapsed ? "+" : "−"}
                    </span>
                  </div>
                </button>
              )}
              {!isCollapsed && (
                <>
                  <div className="space-y-6">
                    {(visibleServices as DisplayService[]).map((service, i) => renderService(service, i))}
                  </div>
                  {group.services.length > INITIAL_SERVICE_LIMIT && (
                    <div className="mt-8 text-center">
                      <button
                        type="button"
                        onClick={() => toggleExpandedGroup(groupKey)}
                        className="border px-5 py-2 text-xs font-light uppercase tracking-[0.3em]"
                        style={{ borderColor: rc.primaryOnBg, color: rc.primaryOnBg }}
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
