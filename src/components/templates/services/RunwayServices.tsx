"use client";

import { useState } from "react";
import Image from "next/image";
import type { ServiceItem } from "@/lib/ai/types";
import { formatDuration } from "@/lib/availability";
import { openBookingCalendarForService, requestBookingChoice } from "@/lib/booking-events";
import { ensureReadable } from "@/lib/templates/contrast";
import type { ThemeColors } from "@/lib/templates/themes";
import { AnimateSection } from "../shared/AnimateSection";
import { useServiceCategoryCollapse } from "./useServiceCategoryCollapse";

type Mode = "in_site_only" | "external_only" | "both";

const INITIAL_FLAT_SERVICE_LIMIT = 9;
const INITIAL_GROUP_SERVICE_LIMIT = 6;

type DisplayService = {
  name: string;
  price: string;
  description?: string;
  bookingDeepLink?: string;
  durationMinutes?: number;
  image?: string;
  category?: string;
};

interface RunwayServicesProps {
  services: DisplayService[];
  categories?: string[];
  colors: ThemeColors;
  bookingMode?: Mode;
  defaultCategoriesCollapsed?: boolean;
}

export function RunwayServices({
  services,
  categories,
  colors,
  bookingMode,
  defaultCategoriesCollapsed,
}: RunwayServicesProps) {
  const runwayBackground = "#030303";
  const runwayPanel = "#0D0B08";
  const gold = ensureReadable(colors.primary || "#D8B15A", runwayBackground, 3);
  const ivory = ensureReadable("#FFF4D8", runwayBackground);
  const buttonText = ensureReadable("#050505", gold);
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

  const renderService = (service: DisplayService, i: number, isCompact = false) => {
    const m = bookingMode ?? "in_site_only";
    const canBook = !(m === "external_only" && !service.bookingDeepLink);
    const useCompactLayout = isCompact && Boolean(service.image);
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
      <AnimateSection key={service.name} animation="fade-up" delay={i * 0.1}>
        <div
          className={`group relative overflow-hidden border bg-white/[0.035] shadow-2xl transition-all duration-300 hover:-translate-y-1.5 hover:shadow-[0_0_45px_rgba(216,177,90,0.16)] ${
            useCompactLayout
              ? "grid min-h-[15rem] grid-cols-[42%_minmax(0,1fr)]"
              : "min-h-[220px] p-6"
          } ${
            canBook ? "hover:border-opacity-70" : ""
          }`}
          style={{
            background: `linear-gradient(145deg, rgba(255,255,255,0.08), rgba(255,255,255,0.025)), ${runwayPanel}`,
            borderColor: `${gold}38`,
            color: ivory,
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute left-[-110%] top-0 h-px w-[90%] bg-gradient-to-r from-transparent via-[#D8B15A] to-transparent transition-[left] duration-500 group-hover:left-[110%]"
          />

          {service.image && (
            <div
              className={
                useCompactLayout
                  ? "min-h-[15rem] overflow-hidden border-r bg-neutral-950"
                  : "-mx-6 -mt-6 mb-6 h-64 overflow-hidden border-b bg-neutral-950"
              }
              style={{ borderColor: `${gold}2E` }}
            >
              <Image
                src={service.image}
                alt={service.name}
                width={720}
                height={440}
                sizes="(max-width: 768px) 100vw, 33vw"
                className={`h-full w-full object-contain brightness-75 contrast-110 saturate-95 transition duration-500 group-hover:brightness-90 group-hover:saturate-100 ${
                  useCompactLayout ? "" : "group-hover:scale-105"
                }`}
                unoptimized
              />
            </div>
          )}

          <div className={useCompactLayout ? "flex min-w-0 flex-col justify-center p-4" : ""}>
            <div
              className={`flex items-start justify-between ${
                useCompactLayout ? "mb-4 gap-3" : "mb-8 gap-5"
              }`}
            >
              <span
                className="text-[0.68rem] font-black uppercase tracking-[0.34em]"
                style={{ color: gold }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="text-right">
                <div
                  className={`whitespace-nowrap font-black ${
                    useCompactLayout ? "text-base" : "text-lg"
                  }`}
                  style={{ color: gold }}
                >
                  {service.price}
                </div>
                <div className="mt-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/45">
                  {formatDuration(service.durationMinutes ?? 60)}
                </div>
              </div>
            </div>

            <h3
              className={`max-w-[16rem] font-black uppercase leading-[0.95] tracking-[-0.04em] ${
                useCompactLayout ? "text-xl sm:text-2xl" : "text-3xl"
              }`}
            >
              {service.name}
            </h3>

            {service.description && (
              <p
                className={`text-sm text-white/65 ${
                  useCompactLayout
                    ? "mt-3 line-clamp-3 leading-5"
                    : "mt-4 line-clamp-4 leading-7"
                }`}
              >
                {service.description}
              </p>
            )}

            {canBook && (
              <button
                type="button"
                aria-label={`Book ${service.name}`}
                onClick={(e) => {
                  e.stopPropagation();
                  triggerBook();
                }}
                className={`inline-flex min-h-11 items-center justify-center self-start text-[0.68rem] font-black uppercase tracking-[0.22em] transition-all hover:-translate-y-0.5 hover:shadow-[0_0_28px_rgba(216,177,90,0.24)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
                  useCompactLayout ? "mt-4 px-4" : "mt-7 px-5"
                }`}
                style={{
                  backgroundColor: gold,
                  color: buttonText,
                }}
              >
                Book Look
              </button>
            )}
          </div>
        </div>
      </AnimateSection>
    );
  };

  return (
    <section
      className="relative isolate overflow-hidden px-6 py-24 text-white md:px-10 lg:px-16"
      style={{
        background:
          "radial-gradient(circle at 10% 0%, rgba(216,177,90,0.18), transparent 28rem), radial-gradient(circle at 92% 18%, rgba(216,177,90,0.14), transparent 24rem), #030303",
      }}
    >
      <div className="relative z-10 mx-auto max-w-7xl">
        <AnimateSection>
          <div className="mb-12 flex flex-col justify-between gap-6 md:flex-row md:items-end">
            <h2 className="max-w-4xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.05em] sm:text-5xl md:text-6xl lg:text-7xl">
              Signature Services
            </h2>
            <p className="max-w-sm text-sm leading-7 text-white/60 md:text-base">
              Category-led service cards, image-forward looks, and direct booking for the exact style they want.
            </p>
          </div>
        </AnimateSection>

        {groups.map((group) => {
          const groupKey = group.label ?? "_flat";
          const isCollapsed = group.label ? !!collapsed[group.label] : false;
          const serviceLimit = group.label ? INITIAL_GROUP_SERVICE_LIMIT : INITIAL_FLAT_SERVICE_LIMIT;
          const shouldLimitGroup = group.services.length > serviceLimit && !expandedGroups[groupKey];
          const visibleServices = shouldLimitGroup
            ? group.services.slice(0, serviceLimit)
            : group.services;
          const isCompactGroup = visibleServices.length === 1;
          const groupId = group.label
            ? `runway-services-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`
            : undefined;
          const thumbUrl = group.label ? categoryPreviewImage(group.services as DisplayService[]) : undefined;

          return (
            <div key={groupKey} className="mb-10 last:mb-0">
              {group.label && (
                <button
                  type="button"
                  onClick={() => toggle(group.label!)}
                  aria-expanded={!isCollapsed}
                  aria-controls={groupId}
                  className="group/cat mb-6 flex h-auto min-h-[4.75rem] w-full items-center gap-3 overflow-hidden rounded-xl border py-3 pl-0 pr-4 text-left shadow-[0_10px_36px_rgb(0,0,0,0.32),inset_0_1px_0_rgb(255,255,255,0.05)] backdrop-blur-sm transition-[transform,border-color,box-shadow] hover:-translate-y-0.5 hover:shadow-[0_14px_44px_rgb(0,0,0,0.38),inset_0_1px_0_rgb(255,255,255,0.06)] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/35 md:min-h-[5.25rem] md:gap-4 md:pr-5"
                  style={{
                    backgroundColor: `${gold}12`,
                    borderColor: `${gold}44`,
                  }}
                >
                  <div className="relative h-[4.75rem] w-[4.5rem] shrink-0 overflow-hidden rounded-l-xl md:h-[5.25rem] md:w-[5.25rem]">
                    {thumbUrl ? (
                      <Image
                        src={thumbUrl}
                        alt=""
                        fill
                        className="object-cover object-top transition-transform duration-500 group-hover/cat:scale-105"
                        sizes="84px"
                        unoptimized
                      />
                    ) : (
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          background: `linear-gradient(135deg, ${gold}66 0%, rgba(13,11,8,0.95) 50%, rgb(8,7,6) 100%)`,
                        }}
                      />
                    )}
                  </div>

                  <div className="flex min-h-[3.75rem] min-w-0 flex-1 flex-col justify-center gap-1 pr-1">
                    <span
                      className="truncate text-[0.95rem] font-black uppercase leading-snug tracking-wide md:text-[1.05rem]"
                      style={{ color: ivory }}
                    >
                      {group.label}
                    </span>
                    <span
                      className="text-[0.8rem] font-medium leading-snug md:text-[0.85rem]"
                      style={{ color: ivory, opacity: 0.62 }}
                    >
                      {group.services.length} {group.services.length === 1 ? "service" : "services"}
                    </span>
                  </div>

                  <span
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-lg transition-transform md:h-12 md:w-12"
                    style={{
                      backgroundColor: gold,
                      color: buttonText,
                      boxShadow: `0 0 22px ${gold}99, 0 6px 18px rgb(0,0,0,0.4)`,
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
                  <div
                    id={groupId}
                    className={`grid gap-4 ${
                      isCompactGroup ? "max-w-3xl grid-cols-1" : "md:grid-cols-2 lg:grid-cols-3"
                    }`}
                  >
                    {(visibleServices as DisplayService[]).map((service, i) =>
                      renderService(service, i, isCompactGroup),
                    )}
                  </div>
                  {group.services.length > serviceLimit && (
                    <div className="mt-6 flex justify-center">
                      <button
                        type="button"
                        onClick={() => toggleExpandedGroup(groupKey)}
                        className="border px-6 py-3 text-[0.68rem] font-black uppercase tracking-[0.24em] transition-all hover:-translate-y-0.5 hover:bg-white/10"
                        style={{ borderColor: `${gold}66`, color: gold }}
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
