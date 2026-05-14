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

export function BoldServices({ services, categories, colors, bookingMode, defaultCategoriesCollapsed }: ServicesProps) {
  const rc = readableColors(colors);
  const { groups, collapsed, toggle } = useServiceCategoryCollapse(
    services as unknown as ServiceItem[],
    categories,
    defaultCategoriesCollapsed,
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleExpandedGroup = (label: string) =>
    setExpandedGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const categoryPreviewImage = (groupServices: DisplayService[]) => {
    const withUrl = groupServices.find((s) => typeof s.image === "string" && s.image.trim().length > 0);
    return withUrl?.image?.trim();
  };

  const renderService = (service: DisplayService, i: number) => {
    const m = bookingMode ?? "in_site_only";
    const canBook = !(m === "external_only" && !service.bookingDeepLink);
    const isFeatured = i === 0;
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
      <AnimateSection key={service.name} animation="slide-right" delay={i * 0.1}>
        <div
          className={`relative overflow-hidden rounded-2xl border p-6 shadow-xl transition-all hover:-translate-y-1 hover:shadow-2xl ${
            isFeatured ? "md:col-span-2 md:grid md:grid-cols-[0.9fr_1.1fr] md:gap-6" : ""
          } ${canBook ? "cursor-pointer" : ""}`}
          style={{ backgroundColor: colors.muted, borderColor: `${colors.primary}40` }}
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
            <div className={`relative mb-4 overflow-hidden rounded-xl ${isFeatured ? "h-56 md:mb-0 md:h-full" : "h-40"}`}>
              <Image
                src={service.image}
                alt={service.name}
                fill
                sizes={isFeatured ? "(max-width: 768px) 100vw, 50vw" : "(max-width: 768px) 100vw, 33vw"}
                className="object-cover transition-transform duration-500 hover:scale-105"
                unoptimized
              />
            </div>
          )}
          <div className={isFeatured ? "flex h-full flex-col justify-between" : ""}>
            <div>
              <div className="mb-3 flex items-start justify-between gap-4">
                <h3 className={isFeatured ? "text-2xl font-black uppercase leading-tight md:text-3xl" : "text-lg font-bold"} style={{ color: rc.textOnMuted }}>
                  {service.name}
                </h3>
                <div className="text-right">
                  <div className="whitespace-nowrap text-lg font-black" style={{ color: rc.primaryOnMuted }}>
                    {service.price}
                  </div>
                  <div className="text-xs opacity-70" style={{ color: rc.primaryOnMuted }}>
                    {formatDuration(service.durationMinutes ?? 60)}
                  </div>
                </div>
              </div>
              {isFeatured && (
                <p className="mb-3 text-[0.68rem] font-black uppercase tracking-[0.26em]" style={{ color: rc.primaryOnMuted }}>
                  Featured service
                </p>
              )}
              {service.description && (
                <p
                  className={isFeatured ? "text-sm leading-7 opacity-70 line-clamp-5" : "text-sm opacity-60 line-clamp-4"}
                  style={{ color: rc.textOnMuted }}
                >
                  {service.description}
                </p>
              )}
            </div>
            {canBook && (
              <div className="mt-5">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); triggerBook(); }}
                  className="w-full rounded-full px-5 py-3 text-sm font-black uppercase tracking-wider transition-transform hover:-translate-y-0.5"
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
    <section
      className="relative isolate px-6 py-20"
      style={{
        background: `radial-gradient(circle at 50% -20%, ${colors.primary}33, transparent 46%), ${colors.foreground}`,
      }}
    >
      <div className="mx-auto max-w-5xl">
        <AnimateSection>
          <h2 className="mb-12 text-3xl font-black uppercase tracking-wider md:text-4xl" style={{ color: rc.textOnFg }}>
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
          const groupId = group.label
            ? `bold-services-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`
            : undefined;
          const thumbUrl = group.label ? categoryPreviewImage(group.services as DisplayService[]) : undefined;

          return (
            <div key={groupKey} className="mb-8">
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggle(group.label!)}
                  aria-expanded={!isCollapsed}
                  aria-controls={groupId}
                  className="group/cat mb-4 flex min-h-[5.125rem] w-full items-center gap-3 overflow-hidden rounded-[14px] border py-3 pl-0 pr-4 text-left shadow-[0_10px_36px_rgb(0,0,0,0.35),inset_0_1px_0_rgb(255,255,255,0.05)] backdrop-blur-[4px] transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_44px_rgb(0,0,0,0.42),inset_0_1px_0_rgb(255,255,255,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:min-h-[6.125rem] md:gap-4 md:pr-[1.125rem]"
                  style={{
                    backgroundColor: `${colors.primary}10`,
                    borderColor: `${colors.primary}44`,
                  }}
                >
                  <div
                    className="relative w-[clamp(4.25rem,18vw,5.35rem)] shrink-0 overflow-hidden rounded-l-[14px] rounded-r-md md:w-[clamp(5rem,17vw,5.35rem)]"
                    style={{ height: "calc(clamp(4.25rem, 18vw, 5.35rem) + 10px)" }}
                  >
                    {thumbUrl ? (
                      <Image
                        src={thumbUrl}
                        alt=""
                        fill
                        className="object-cover transition-transform duration-500 group-hover/cat:scale-105"
                        sizes="96px"
                        unoptimized
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${colors.primary}, rgba(26,12,26,0.96) 72%, rgb(14,11,13) 100%)`,
                        }}
                      />
                    )}
                  </div>

                  <div className="flex min-h-[3.625rem] min-w-0 flex-1 flex-col justify-center gap-1 py-1 pr-1 md:gap-1.5">
                    <span
                      className="truncate text-base font-black uppercase leading-snug tracking-[0.04em] md:text-lg"
                      style={{ color: rc.textOnFg }}
                    >
                      {group.label}
                    </span>
                    <span className="text-[0.8rem] font-medium leading-snug text-[#a8a8b0] md:text-[0.85rem]">
                      {group.services.length} {group.services.length === 1 ? "service" : "services"}
                    </span>
                  </div>

                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full md:h-[43px] md:w-[43px]"
                    style={{
                      backgroundColor: colors.primary,
                      color: "#ffffff",
                      boxShadow: `0 0 26px ${colors.primary}B3, 0 6px 18px rgb(0,0,0,0.45)`,
                    }}
                    aria-hidden
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-[1.1rem] w-[1.1rem] transition-transform duration-300 ease-out md:h-5 md:w-5 ${!isCollapsed ? "rotate-90" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M9 6l6 6-6 6" />
                    </svg>
                  </span>
                </button>
              )}
              {!isCollapsed && (
                <>
                  <div id={groupId} className="grid gap-4 md:grid-cols-3">
                    {(visibleServices as DisplayService[]).map((service, i) => renderService(service, i))}
                  </div>
                  {group.services.length > INITIAL_SERVICE_LIMIT && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleExpandedGroup(groupKey)}
                        className="rounded-full border px-5 py-2 text-xs font-bold uppercase tracking-wider"
                        style={{ borderColor: colors.primary, color: rc.primaryOnFg }}
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
